import { z } from "zod";

export const connectionStatusSchema = z.enum(["pending", "accepted", "rejected", "withdrawn"]);

export const connectionSchema = z.object({
  id: z.string().uuid(),
  requesterId: z.string().uuid(),
  addresseeId: z.string().uuid(),
  status: connectionStatusSchema,
  note: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Connection = z.infer<typeof connectionSchema>;

export const sendConnectionInput = z.object({
  addresseeId: z.string().uuid(),
  note: z.string().optional(),
});
export type SendConnectionInput = z.infer<typeof sendConnectionInput>;

export const respondConnectionInput = z.object({
  connectionId: z.string().uuid(),
  action: z.enum(["accept", "reject"]),
});
export type RespondConnectionInput = z.infer<typeof respondConnectionInput>;

export const myConnectionsInput = z.object({
  status: connectionStatusSchema.extract(["pending", "accepted"]),
  direction: z.enum(["sent", "received"]).optional(),
});
export type MyConnectionsInput = z.infer<typeof myConnectionsInput>;
