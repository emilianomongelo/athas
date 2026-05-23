import { createSqlStore } from "../../sql/create-sql-store";

export const useSnowflakeStore = createSqlStore("snowflake", "connection");
