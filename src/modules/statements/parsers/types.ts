import type { Channel, TxType } from '../../../common/types';

export interface ExtractedHeader {
  bankCode: string;
  bankName: string;
  accountLast4?: string;
  ifsc?: string;
  periodFrom?: Date;
  periodTo?: Date;
  openingBalancePaise: number;
  closingBalancePaise: number;
  totalDebitPaise: number;
  totalCreditPaise: number;
}

export interface ExtractedRow {
  date: Date;
  valueDate?: Date;
  narration: string;
  debitPaise: number;
  creditPaise: number;
  balanceAfterPaise?: number;
  upiRef?: string;
  cheque?: string;
}

export interface ParseResult {
  header: ExtractedHeader;
  rows: ExtractedRow[];
  method: string;
}

export interface ClassifiedRow extends ExtractedRow {
  type: TxType;
  channel: Channel;
  merchant?: string;
  categorySlug?: string;
  confidence: number;
  excludedFromSpend: boolean;
  classifiedBy?: 'rules' | 'rule' | 'family' | 'ai' | 'user';
}
