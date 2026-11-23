export const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    if (ret._id) ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    delete ret.refreshTokenHash;
    delete ret.storedPath;
    return ret;
  },
};
