import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email({ error: "أدخل بريدًا إلكترونيًا صحيحًا." })),
  password: z.string().min(1, { error: "أدخل كلمة المرور." }),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().pipe(z.email({ error: "أدخل بريدًا إلكترونيًا صحيحًا." })),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
