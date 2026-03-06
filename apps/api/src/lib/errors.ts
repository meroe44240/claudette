export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(404, id ? `${entity} avec l'id ${id} introuvable` : `${entity} introuvable`);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: Record<string, string[]>) {
    super(400, message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Accès interdit') {
    super(403, message);
    this.name = 'ForbiddenError';
    this.code = 'FORBIDDEN';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Non authentifié') {
    super(401, message);
    this.name = 'UnauthorizedError';
    this.code = 'UNAUTHORIZED';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
    this.code = 'CONFLICT';
  }
}
