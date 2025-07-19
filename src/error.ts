import { Response } from 'express';
import * as T from './types';

export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly error: string;

    constructor(statusCode: number, error: string, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.error = error;
    }
}

export const handleErrors = (err: Error, res: Response) => {
    if (err instanceof ApiError) {
        const errorResponse: T.ErrorResponse = {
            error: err.error,
            message: err.message,
        };
        return res.status(err.statusCode).json(errorResponse);
    }

    console.error(err);
    const errorResponse: T.ErrorResponse = {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred.',
    };
    res.status(500).json(errorResponse);
}; 