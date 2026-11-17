import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore if custom DNS is not permitted
}

import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import {
  User,
  Doctor,
  Patient,
  Lead,
  Appointment,
  Note,
  Task,
  Activity,
  Notification,
  AuditLog,
  Token,
} from '../src/modules/index.js';

const models = [
  { name: 'User', model: User },
  { name: 'Doctor', model: Doctor },
  { name: 'Patient', model: Patient },
  { name: 'Lead', model: Lead },
  { name: 'Appointment', model: Appointment },
  { name: 'Note', model: Note },
  { name: 'Task', model: Task },
  { name: 'Activity', model: Activity },
  { name: 'Notification', model: Notification },
  { name: 'AuditLog', model: AuditLog },
  { name: 'Token', model: Token },
];

async function syncAllIndexes() {
  try {
    console.log('Connecting to development database...');
    await mongoose.connect(env.MONGODB_URI);
    console.log(`Connected to database: ${mongoose.connection.db?.databaseName}`);

    console.log('\n--- Syncing Model Indexes ---');
    for (const { name, model } of models) {
      console.log(`\nSyncing indexes for collection: ${model.collection.name} (${name})...`);
      await model.syncIndexes();
      const indexes = await model.collection.indexes();
      console.log(`Indexes for ${name}:`);
      indexes.forEach((idx) => {
        const keys = Object.entries(idx.key)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        const props = [];
        if (idx.unique) props.push('unique');
        if (idx.sparse) props.push('sparse');
        if (idx.expireAfterSeconds !== undefined) props.push(`TTL: ${idx.expireAfterSeconds}s`);
        if (idx.partialFilterExpression) {
          props.push(`partial: ${JSON.stringify(idx.partialFilterExpression)}`);
        }
        console.log(`  - ${idx.name} on (${keys}) ${props.length ? `[${props.join(', ')}]` : ''}`);
      });
    }

    console.log('\nAll indexes synchronized successfully.');
  } catch (error) {
    console.error('Error synchronizing indexes:', error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from database.');
    }
  }
}

syncAllIndexes();
