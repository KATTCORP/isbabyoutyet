import { createApi } from "@convex-dev/better-auth";
import { adapterAuthOptions } from "./adapterAuthOptions";
import schema from "./schema";

export const { create, deleteMany, deleteOne, findMany, findOne, updateMany, updateOne } =
  createApi(schema, () => adapterAuthOptions);
