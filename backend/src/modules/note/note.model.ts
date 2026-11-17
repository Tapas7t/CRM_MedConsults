import { Schema, model, Document, Types } from 'mongoose';
import { NoteVisibility, NOTE_VISIBILITIES } from '../../types/index.js';

export interface INote {
  patientId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  visibility: NoteVisibility;
  isDraft: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface INoteDocument extends INote, Document<Types.ObjectId> {}

const noteSchema = new Schema<INoteDocument>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author ID is required'],
      index: true,
    },
    body: {
      type: String,
      required: [true, 'Note body is required'],
      trim: true,
    },
    visibility: {
      type: String,
      enum: NOTE_VISIBILITIES,
      default: 'clinical',
      index: true,
    },
    isDraft: {
      type: Boolean,
      default: false,
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

noteSchema.index({ patientId: 1, isDeleted: 1 });
noteSchema.index({ authorId: 1, visibility: 1 });

export const Note = model<INoteDocument>('Note', noteSchema);
