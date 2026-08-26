import { numeric, text, pgTable, serial, index, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from "zod";

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    date: date("date").notNull(),
    createdAt: timestamp('created_at').defaultNow()
  },
  (expenses) => {
    return {
      userIdIndex: index("name_idx").on(expenses.userId),
    };
  }
);

// Schema for inserting a user - can be used to validate API requests
export const insertExpensesSchema = createInsertSchema(expenses, {
  title: z
    .string()
    .min(3, { message: "Title must be at least 3 characters" }),
  // numeric(12,2) holds at most 10 integer digits — reject anything larger
  // here so bad input fails validation (400) instead of crashing Postgres (500)
  amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, {message: "Amount must be a valid monetary value"}),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be in YYYY-MM-DD format" })
    .refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid calendar date" })
});
// Schema for selecting a Expenses - can be used to validate API responses
export const selectExpensesSchema = createSelectSchema(expenses);