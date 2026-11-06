import mongoose from 'mongoose';
import { config } from '../config.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string = config.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
  });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export async function dbPing(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    await mongoose.connection.db!.admin().ping();
    return true;
  } catch {
    return false;
  }
}
