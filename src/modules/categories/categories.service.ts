import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './category.schema';
import { SYSTEM_CATEGORIES } from './seed';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(@InjectModel(Category.name) private model: Model<CategoryDocument>) {}

  async onModuleInit() {
    const parents = SYSTEM_CATEGORIES.filter((c) => !c.parent);
    const children = SYSTEM_CATEGORIES.filter((c) => c.parent);
    for (const c of parents) {
      const rest = { name: c.name, slug: c.slug, kind: c.kind, color: c.color };
      await this.model.updateOne(
        { slug: c.slug, isSystem: true },
        { $set: { ...rest, isSystem: true, parentId: null } },
        { upsert: true },
      );
    }
    const stored = await this.model.find({ isSystem: true }).select('slug _id').lean();
    const ids = new Map(stored.map((c) => [c.slug, c._id]));
    for (const c of children) {
      const { parent, ...rest } = c;
      const parentId = parent ? ids.get(parent) : undefined;
      await this.model.updateOne(
        { slug: c.slug, isSystem: true },
        { $set: { ...rest, isSystem: true, parentId: parentId ?? null } },
        { upsert: true },
      );
    }
  }

  list(userId: string) {
    return this.model
      .find({ $or: [{ isSystem: true }, { userId: new Types.ObjectId(userId) }] })
      .sort({ kind: 1, name: 1 })
      .lean()
      .exec();
  }

  bySlug(slug: string) {
    return this.model.findOne({ slug, isSystem: true });
  }

  create(userId: string, data: { name: string; kind: string; color?: string; parentId?: string }) {
    const parentId = data.parentId ? new Types.ObjectId(data.parentId) : undefined;
    const slug = (data.name ?? 'custom')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return this.model.create({
      name: data.name,
      kind: data.kind,
      color: data.color ?? '#14b8a6',
      parentId,
      userId: new Types.ObjectId(userId),
      isSystem: false,
      slug: `c-${slug}`,
    });
  }

  async update(
    userId: string,
    id: string,
    data: { name?: string; kind?: string; color?: string; parentId?: string | null },
  ) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Category not found');
    if (doc.isSystem) {
      throw new BadRequestException('Built-in categories cannot be renamed. Add your own instead.');
    }
    if (String(doc.userId) !== String(userId)) throw new NotFoundException('Category not found');
    if (data.name) doc.name = data.name;
    if (data.color) doc.color = data.color;
    if (data.kind) doc.kind = data.kind;
    if (data.parentId === null || data.parentId === '') doc.parentId = undefined;
    else if (data.parentId) doc.parentId = new Types.ObjectId(data.parentId);
    await doc.save();
    return doc;
  }

  async remove(userId: string, id: string) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Category not found');
    if (doc.isSystem) throw new BadRequestException('Built-in categories cannot be deleted');
    if (String(doc.userId) !== String(userId)) throw new NotFoundException('Category not found');
    await this.model.deleteMany({ parentId: doc._id, userId: doc.userId });
    await doc.deleteOne();
    return { id: String(doc._id), deleted: true };
  }
}
