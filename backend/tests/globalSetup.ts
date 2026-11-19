import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore
}

import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import {
  User,
  Doctor,
  Patient,
  Lead,
  Appointment,
  Counter,
  Note,
  Task,
  Activity,
  Notification,
  AuditLog,
  Token,
} from '../src/modules/index.js';

export async function setup() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI_TEST);
  }
  const models = [
    User,
    Doctor,
    Patient,
    Lead,
    Appointment,
    Counter,
    Note,
    Task,
    Activity,
    Notification,
    AuditLog,
    Token,
  ];

  for (const model of models) {
    await model.syncIndexes();
  }

  await mongoose.disconnect();
}
