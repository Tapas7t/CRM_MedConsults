import type { Request, Response, NextFunction } from 'express';
import { patientService } from './patient.service.js';

export class PatientController {
  async getPatientMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.getPatientMe(req.user!);
      res.status(200).json({
        success: true,
        data: { patient: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async getPatients(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.getPatients(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async createPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.createPatient(req.body, req.user!, req.ip);
      res.status(201).json({
        success: true,
        data: { patient: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async getPatientById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.getPatientById(
        req.params.id as string,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: { patient: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async getPatientTimeline(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.getPatientTimeline(
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

  async updatePatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.updatePatient(
        req.params.id as string,
        req.body,
        req.user!,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: { patient: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async deletePatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await patientService.deletePatient(
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

export const patientController = new PatientController();
