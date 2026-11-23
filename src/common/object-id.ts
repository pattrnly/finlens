import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

export function objectId(id: string, label = 'Record'): Types.ObjectId {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new NotFoundException(`${label} not found`);
  }
  return new Types.ObjectId(id);
}

export function ownedFilter(userId: string, id: string, label = 'Record') {
  return { _id: objectId(id, label), userId: objectId(userId, label) };
}
