import { createConnectionSqlViewer } from "../sql/sql-provider-viewer";
import { useSnowflakeStore } from "./stores/snowflake-store";

export default createConnectionSqlViewer("snowflake", useSnowflakeStore);
