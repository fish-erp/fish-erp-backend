import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class DocumentSequenceService {
  async next(
    tx: Prisma.TransactionClient,
    prefix: 'IMP' | 'INV',
    occurredAt = new Date(),
  ): Promise<string> {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(occurredAt);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) throw new Error('Không thể xác định tháng sinh mã phiếu');
    const key = `${prefix}-${year}${month}`;
    const sequence = await tx.documentSequence.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });

    return `${key}-${String(sequence.value).padStart(4, '0')}`;
  }
}
