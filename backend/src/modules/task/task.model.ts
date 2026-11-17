import { Schema, model, Document, Types } from 'mongoose';
import { TaskPriority, TaskStatus, TASK_PRIORITIES, TASK_STATUSES } from '../../types/index.js';

export interface ITask {
  title: string;
  description?: string;
  patientId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  assignedTo: Types.ObjectId;
  dueDate: Date;
  priority: TaskPriority;
  status: TaskStatus;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITaskDocument extends ITask, Document<Types.ObjectId> {}

const taskSchema = new Schema<ITaskDocument>(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned user is required'],
      index: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: 'open',
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ assignedTo: 1, dueDate: 1, status: 1 });
taskSchema.index({ status: 1, isDeleted: 1 });

export const Task = model<ITaskDocument>('Task', taskSchema);
