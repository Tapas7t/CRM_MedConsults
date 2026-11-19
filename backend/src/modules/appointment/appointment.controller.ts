import type { Request, Response, NextFunction } from 'express';
import { appointmentService } from './appointment.service.js';

export class AppointmentController {
  async bookAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.bookAppointment(req.body, req.user!);
      res.status(201).json({
        success: true,
        data: {
          appointment: result,
          tokenNumber: result.tokenNumber,
          appointmentCode: result.appointmentCode,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.getAppointments(req.query as any, req.user!);
      res.status(200).json({
        success: true,
        data: {
          appointments: result.appointments,
          pagination: result.pagination,
        },
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.getSummary(req.query.date as string | undefined, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async createWalkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.createWalkIn(req.body, req.user!, req.ip);
      res.status(201).json({
        success: true,
        data: {
          appointment: result,
          tokenNumber: result.tokenNumber,
          appointmentCode: result.appointmentCode,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getAppointmentById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.getAppointmentById(req.params.id as string, req.user!);
      res.status(200).json({
        success: true,
        data: {
          appointment: result,
          tokenNumber: result.tokenNumber,
          appointmentCode: result.appointmentCode,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.rescheduleAppointment(
        req.params.id as string,
        req.body,
        req.user!
      );
      res.status(200).json({
        success: true,
        data: {
          appointment: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.cancelAppointment(
        req.params.id as string,
        req.body,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          appointment: result.appointment,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async checkInAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.checkInAppointment(
        req.params.id as string,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: {
          appointment: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async startConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.startConsultation(
        req.params.id as string,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: {
          appointment: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async completeConsultation(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.completeConsultation(
        req.params.id as string,
        req.user!
      );
      res.status(200).json({
        success: true,
        data: {
          appointment: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async markNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await appointmentService.markNoShow(
        req.params.id as string,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: {
          appointment: result,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getTodayQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const doctorId = req.query.doctorId as string | undefined;
      const result = await appointmentService.getTodayQueue(doctorId, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const appointmentController = new AppointmentController();
