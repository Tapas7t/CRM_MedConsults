import type { IUserDocument } from '../modules/user/user.model.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
    }
  }
}

export {};
