export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Reservation API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:4000' }],
  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['ok', 'code', 'message'],
        properties: {
          ok: { type: 'boolean', const: false },
          code: {
            type: 'string',
            enum: [
              'VALIDATION',
              'DB_ERROR',
              'PIN_REQUIRED',
              'INVALID_PIN',
              'NOT_ACTIVE_YET',
              'EXPIRED',
            ],
          },
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      CreateReservationBody: {
        type: 'object',
        required: ['firstName', 'lastName', 'phone', 'scheduledAt'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
        },
      },
      ConfirmPinBody: {
        type: 'object',
        required: ['pin'],
        properties: {
          pin: { type: 'string', pattern: '^\\d{4,9}$' },
        },
      },
      CreateOk: {
        type: 'object',
        required: ['ok', 'id', 'pin', 'activeFrom', 'nominalExpiry'],
        properties: {
          ok: { type: 'boolean', const: true },
          id: { type: 'string' },
          pin: { type: 'string' },
          activeFrom: { type: 'string', format: 'date-time' },
          nominalExpiry: { type: 'string', format: 'date-time' },
        },
      },
      PublicReservationRow: {
        type: 'object',
        required: [
          'id',
          'firstName',
          'lastName',
          'phone',
          'scheduledAt',
          'status',
          'pinLast4',
          'createdAt',
        ],
        properties: {
          id: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
          status: { type: 'string' },
          confirmedAt: { type: 'string', format: 'date-time', nullable: true },
          pinLast4: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ConfirmOk: {
        type: 'object',
        required: ['ok', 'expectedStart', 'validFrom', 'validUntil'],
        properties: {
          ok: { type: 'boolean', const: true },
          expectedStart: { type: 'string', format: 'date-time' },
          validFrom: { type: 'string', format: 'date-time' },
          validUntil: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
              },
            },
          },
        },
      },
    },
    '/api/reservations': {
      get: {
        parameters: [
          {
            in: 'query',
            name: 'sort',
            schema: { type: 'string', enum: ['asc', 'desc'] },
          },
        ],
        responses: {
          200: {
            description: 'List reservations',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/PublicReservationRow' },
                },
              },
            },
          },
          500: {
            description: 'DB error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateReservationBody' },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateOk' },
              },
            },
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          500: {
            description: 'DB error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/reservations/confirm': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConfirmPinBody' },
            },
          },
        },
        responses: {
          200: {
            description: 'Confirmed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConfirmOk' },
              },
            },
          },
          400: {
            description: 'Invalid PIN / Not active yet',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          410: {
            description: 'Expired',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
} as const;

