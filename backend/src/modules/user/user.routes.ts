import { Router } from 'express';
import { userController } from './user.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import {
  updateMeSchema,
  getUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
} from './user.schemas.js';

export const userRouter = Router();

// All user routes require authentication
userRouter.use(requireAuth);

// 1. Own profile routes (any authenticated user)
userRouter.get('/me', userController.getMe);
userRouter.patch('/me', validate(updateMeSchema), userController.updateMe);

// 2. Admin user management routes
userRouter.get(
  '/',
  roleGuard('admin'),
  validate(getUsersQuerySchema, 'query'),
  userController.getUsers
);

userRouter.post(
  '/',
  roleGuard('admin'),
  validate(createUserSchema),
  userController.createUser
);

userRouter.patch(
  '/:id',
  roleGuard('admin'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  userController.updateUser
);

userRouter.post(
  '/:id/block',
  roleGuard('admin'),
  validate(userIdParamSchema, 'params'),
  userController.blockUser
);

userRouter.post(
  '/:id/unblock',
  roleGuard('admin'),
  validate(userIdParamSchema, 'params'),
  userController.unblockUser
);
