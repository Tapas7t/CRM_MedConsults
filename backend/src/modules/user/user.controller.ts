import type { Request, Response, NextFunction } from 'express';
import { Doctor } from '../doctor/doctor.model.js';
import { Patient } from '../patient/patient.model.js';

export class UserController {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      let approvalStatus: string | undefined;

      if (user.role === 'doctor') {
        const doctor = await Doctor.findOne({ userId: user._id });
        approvalStatus = doctor?.approvalStatus;
      }

      const userData = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        status: user.status,
        ...(approvalStatus ? { approvalStatus } : {}),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      res.status(200).json({
        success: true,
        data: {
          user: userData,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { name, phone } = req.body;

      if (name !== undefined) {
        user.name = name;
      }
      if (phone !== undefined) {
        user.phone = phone;
      }

      await user.save();

      // If user is patient, sync name and phone to linked Patient record
      if (user.role === 'patient') {
        await Patient.updateOne(
          { userId: user._id },
          {
            $set: {
              ...(name !== undefined ? { name } : {}),
              ...(phone !== undefined ? { phone } : {}),
            },
          }
        );
      }

      let approvalStatus: string | undefined;
      if (user.role === 'doctor') {
        const doctor = await Doctor.findOne({ userId: user._id });
        approvalStatus = doctor?.approvalStatus;
      }

      const userData = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        status: user.status,
        ...(approvalStatus ? { approvalStatus } : {}),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      res.status(200).json({
        success: true,
        data: {
          user: userData,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
