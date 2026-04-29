import { z } from 'zod';

/**
 * Validation schema for Project Identity (Metadata)
 */
export const ProjectIdentitySchema = z.object({
  name: z.string().min(3, "Nama proyek minimal 3 karakter"),
  program_name: z.string().optional().nullable(),
  activity_name: z.string().optional().nullable(),
  work_name: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  location_id: z.string().optional().nullable(),
  fiscal_year: z.string().optional().nullable(),
  contract_number: z.string().optional().nullable(),
  hsp_value: z.number().nonnegative("Pagu HSP tidak boleh negatif").default(0),
  ppn_percent: z.number().min(0).max(100).default(12),
  overhead_percent: z.number().min(0).max(100).default(15),
  start_date: z.string().optional().nullable(),
});

/**
 * Validation schema for a single RAB Line Item (ahsp_lines)
 */
export const RabLineItemSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  master_ahsp_id: z.string().uuid().optional().nullable(),
  bab_pekerjaan: z.string().min(1, "Bab pekerjaan wajib diisi"),
  sort_order: z.number().int().nonnegative().default(0),
  uraian: z.string().min(1, "Uraian pekerjaan wajib diisi"),
  uraian_custom: z.string().optional().nullable(),
  satuan: z.string().optional().nullable(),
  volume: z.number().nonnegative("Volume tidak boleh negatif").default(0),
  harga_satuan: z.number().nonnegative("Harga satuan tidak boleh negatif").default(0),
  jumlah: z.number().nonnegative("Jumlah harga tidak boleh negatif").default(0),
  profit_percent: z.number().min(-100).max(1000).default(15),
  analisa_custom: z.array(z.any()).optional().default([]),
});

/**
 * Validation schema for a list of RAB Line Items
 */
export const RabLinesSchema = z.array(RabLineItemSchema);
