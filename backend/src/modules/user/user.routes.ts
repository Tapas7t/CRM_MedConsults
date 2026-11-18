import { Router } from 'express';
import { userController } from './user.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import { updateMeSchema } from './user.schemas.js';

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get('/me', userController.getMe);
userRouter.patch('/me', validate(updateMeSchema), userController.updateMe);
