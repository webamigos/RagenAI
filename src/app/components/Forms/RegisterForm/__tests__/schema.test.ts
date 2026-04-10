import { describe, it, expect } from 'vitest';
import { registrationSchema } from '../schema';

const t = (key: string) => key;
const schema = registrationSchema(t);

describe('registrationSchema', () => {
  const validData = {
    email: 'test@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    terms: true,
    newsletter_consent: true,
  };

  it('should accept valid registration data', () => {
    const result = schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject when passwords do not match', () => {
    const result = schema.safeParse({
      ...validData,
      confirmPassword: 'differentpassword',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find((i) =>
        i.path.includes('confirmPassword'),
      );
      expect(confirmError).toBeDefined();
    }
  });

  it('should reject when password is too short', () => {
    const result = schema.safeParse({
      ...validData,
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('should reject when email is invalid', () => {
    const result = schema.safeParse({
      ...validData,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should reject when terms are not accepted', () => {
    const result = schema.safeParse({
      ...validData,
      terms: false,
    });
    expect(result.success).toBe(false);
  });

  it('should reject when newsletter consent is not given', () => {
    const result = schema.safeParse({
      ...validData,
      newsletter_consent: false,
    });
    expect(result.success).toBe(false);
  });

  it('should reject when confirmPassword is missing', () => {
    const { confirmPassword: _, ...dataWithoutConfirm } = validData;
    const result = schema.safeParse(dataWithoutConfirm);
    expect(result.success).toBe(false);
  });
});
