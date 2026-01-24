import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { ZodValidationException } from 'nestjs-zod';

interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpAdapter = this.httpAdapterHost.httpAdapter;

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    // Handle Prisma errors first, then HTTP errors, then generic errors
    const { status: httpStatus, message, error } = this.getExceptionDetails(exception);

    const responseBody: ErrorResponse = {
      success: false,
      statusCode: httpStatus,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    this.logError(exception, responseBody);

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }

  // Central method to extract status, message, and error from any exception
  private getExceptionDetails(exception: unknown): {
    status: number;
    message: string;
    error: string;
  } {
    // 1. Handle Prisma errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception);
    }

    // 2. Handle Zod validation errors (from nestjs-zod)
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      // Type guard: ensure zodError has the expected shape
      if (zodError && typeof zodError === 'object' && 'errors' in zodError) {
        const errors = zodError.errors as Array<{ path: (string | number)[]; message: string }>;
        const messages = errors.map((err) => {
          const path = err.path.join('.');
          return path ? `${path}: ${err.message}` : err.message;
        });
        return {
          status: 400,
          message: messages.join(', '),
          error: 'Validation Error',
        };
      }
      // Fallback if zodError shape is unexpected
      return {
        status: 400,
        message: 'Validation failed',
        error: 'Validation Error',
      };
    }

    // 3. Handle HTTP exceptions (NestJS built-in)
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: this.extractMessage(exception),
        error: this.extractErrorName(exception, exception.getStatus()),
      };
    }

    // 4. Handle generic errors
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        error: 'Internal Server Error',
      };
    }

    // 5. Unknown exception type
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'Internal Server Error',
    };
  }

  // Map Prisma error codes to HTTP responses
  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      // Unique constraint violation (e.g., duplicate email)
      case 'P2002': {
        const target = exception.meta?.target;
        const field = Array.isArray(target) ? target.join(', ') : 'field';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${field} already exists`,
          error: 'Conflict',
        };
      }

      // Record not found
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };

      // Foreign key constraint violation
      case 'P2003': {
        const fieldName = exception.meta?.field_name;
        const field = typeof fieldName === 'string' ? fieldName : 'field';
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Invalid reference: ${field} does not exist`,
          error: 'Bad Request',
        };
      }

      // Required field missing
      case 'P2011': {
        const constraint = exception.meta?.constraint;
        const field = typeof constraint === 'string' ? constraint : 'field';
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Missing required field: ${field}`,
          error: 'Bad Request',
        };
      }

      // Default: treat as internal error
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A database error occurred',
          error: 'Internal Server Error',
        };
    }
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null) {
      const responseObj = response as Record<string, unknown>;
      if (Array.isArray(responseObj.message)) {
        return responseObj.message.join(', ');
      }
      if (typeof responseObj.message === 'string') {
        return responseObj.message;
      }
    }
    if (typeof response === 'string') {
      return response;
    }
    return 'An unexpected error occurred';
  }

  private extractErrorName(exception: HttpException, statusCode: number): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const responseObj = response as Record<string, unknown>;
      if (typeof responseObj.error === 'string') {
        return responseObj.error;
      }
    }
    return HttpStatus[statusCode] ?? 'INTERNAL_SERVER_ERROR';
  }

  private logError(exception: unknown, response: ErrorResponse): void {
    const logContext = {
      statusCode: response.statusCode,
      path: response.path,
      error: response.error,
      message: response.message,
    };

    if (response.statusCode >= 500) {
      // Log full stack trace for server errors
      this.logger.error(logContext, exception instanceof Error ? exception.stack : 'Unknown error');
    } else {
      // Log warning for client errors (4xx)
      this.logger.warn(logContext);
    }
  }
}
