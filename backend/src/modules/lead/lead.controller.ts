import type { Request, Response, NextFunction } from 'express';
import { leadService } from './lead.service.js';

export class LeadController {
  async getLeads(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.getLeads(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getLeadsBoard(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.getLeadsBoard();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async createLead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.createLead(req.body, req.user!);
      res.status(201).json({
        success: true,
        data: { lead: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async getLeadById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.getLeadById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: { lead: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateLead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.updateLead(req.params.id as string, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: { lead: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async changeLeadStage(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.changeLeadStage(req.params.id as string, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: { lead: result },
      });
    } catch (err) {
      next(err);
    }
  }

  async convertLead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.convertLead(req.params.id as string, req.user!);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteLead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.deleteLead(req.params.id as string, req.user!, req.ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async handlePublicEnquiry(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.handlePublicEnquiry(req.body, req.ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const leadController = new LeadController();
