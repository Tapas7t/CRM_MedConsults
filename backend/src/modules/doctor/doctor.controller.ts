import type { Request, Response, NextFunction } from 'express';
import { doctorService } from './doctor.service.js';

export class DoctorController {
  async getPublicDoctors(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.getPublicDoctors(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPublicDoctorById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.getPublicDoctorById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: { doctor: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async getDoctorSlots(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query as { date: string };
      const result = await doctorService.getDoctorSlots(req.params.id as string, date);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getDoctorMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.getDoctorMe(req.user!);
      res.status(200).json({
        success: true,
        data: { doctor: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDoctorMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.updateDoctorMe(req.user!, req.body);
      res.status(200).json({
        success: true,
        data: { doctor: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDoctorAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.updateDoctorAvailability(req.user!, req.body);
      res.status(200).json({
        success: true,
        data: { doctor: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDoctorOnline(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.updateDoctorOnline(req.user!, req.body.isOnline);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async recordHeartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.recordHeartbeat(req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getDoctorsAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.getDoctorsAdmin(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPendingDoctors(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.getPendingDoctors();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async approveDoctor(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.approveDoctor(
        req.params.id as string,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async blockDoctor(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await doctorService.blockDoctor(
        req.params.id as string,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const doctorController = new DoctorController();
