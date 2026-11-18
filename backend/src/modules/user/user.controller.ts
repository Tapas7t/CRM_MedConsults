import type { Request, Response, NextFunction } from 'express';
import { userService } from './user.service.js';

export class UserController {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await userService.getMe(req.user!);
      res.status(200).json({
        success: true,
        data: { user: data },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await userService.updateMe(req.user!, req.body);
      res.status(200).json({
        success: true,
        data: { user: data },
      });
    } catch (err) {
      next(err);
    }
  }

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.getUsers(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.createUser(req.body, req.user!, req.ip);
      res.status(201).json({
        success: true,
        data: { user: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.updateUser(req.params.id as string, req.body, req.user!, req.ip);
      res.status(200).json({
        success: true,
        data: { user: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async blockUser(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.blockUser(req.params.id as string, req.user!, req.ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async unblockUser(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.unblockUser(req.params.id as string, req.user!, req.ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
