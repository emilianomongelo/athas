use crate::sql_common::*;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const SNOWFLAKE_API_HOST: &str = "snowflakecomputing.com";
const JWT_EXPIRY_SECONDS: u64 = 600; // 10 minutes

pub struct SnowflakeConnection {
   pub account: String,
   pub username: String,
   pub private_key_pem: String,
   pub http_client: reqwest::Client,
   pub database: Option<String>,
   pub warehouse: Option<String>,
   pub role: Option<String>,
   pub schema: Option<String>,
   jwt_cache: Mutex<Option<(String, u64)>>,
}

impl SnowflakeConnection {
   pub fn new(
      account: String,
      username: String,
      private_key_pem: String,
      database: Option<String>,
      warehouse: Option<String>,
      role: Option<String>,
      schema: Option<String>,
   ) -> Result<Self, String> {
      let http_client = reqwest::Client::builder()
         .build()
         .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

      Ok(Self {
         account,
         username,
         private_key_pem,
         http_client,
         database,
         warehouse,
         role,
         schema,
         jwt_cache: Mutex::new(None),
      })
   }

   fn api_base_url(&self) -> String {
      format!("https://{}.{}", self.account, SNOWFLAKE_API_HOST)
   }

   pub(crate) fn generate_jwt(&self) -> Result<String, String> {
      let now = SystemTime::now()
         .duration_since(UNIX_EPOCH)
         .map_err(|e| format!("System time error: {}", e))?
         .as_secs();

      let expires = now + JWT_EXPIRY_SECONDS;

      // Check cache first
      {
         let cache = self
            .jwt_cache
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
         if let Some((ref cached_jwt, cached_exp)) = *cache {
            if now < cached_exp - 60 {
               return Ok(cached_jwt.clone());
            }
         }
      }

      let private_key = jsonwebtoken::EncodingKey::from_rsa_pem(self.private_key_pem.as_bytes())
         .map_err(|e| format!("Invalid RSA private key: {}", e))?;

      let fingerprint = compute_public_key_fingerprint(&self.private_key_pem)?;
      let iss = format!(
         "{}.{}.SHA256:{}",
         self.account.to_uppercase(),
         self.username.to_uppercase(),
         fingerprint
      );
      let sub = format!(
         "{}.{}",
         self.account.to_uppercase(),
         self.username.to_uppercase()
      );

      let claims = serde_json::json!({
          "iss": iss,
          "sub": sub,
          "iat": now,
          "exp": expires,
      });

      let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
      let jwt = jsonwebtoken::encode(&header, &claims, &private_key)
         .map_err(|e| format!("JWT encoding failed: {}", e))?;

      // Update cache
      {
         let mut cache = self
            .jwt_cache
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
         *cache = Some((jwt.clone(), expires));
      }

      Ok(jwt)
   }

   async fn execute_sql(&self, statement: &str) -> Result<Vec<Vec<serde_json::Value>>, String> {
      let jwt = self.generate_jwt()?;
      let url = format!("{}/api/v2/statements", self.api_base_url());

      let mut body = serde_json::json!({
          "statement": statement,
          "timeout": 60,
      });

      if let Some(ref db) = self.database {
         body["database"] = serde_json::json!(db);
      }
      if let Some(ref schema) = self.schema {
         body["schema"] = serde_json::json!(schema);
      }
      if let Some(ref wh) = self.warehouse {
         body["warehouse"] = serde_json::json!(wh);
      }
      if let Some(ref role) = self.role {
         body["role"] = serde_json::json!(role);
      }

      let response = self
         .http_client
         .post(&url)
         .header("Authorization", format!("Bearer {}", jwt))
         .header("Content-Type", "application/json")
         .header("User-Agent", "athas")
         .header("X-Snowflake-Authorization-Token-Type", "KEYPAIR_JWT")
         .json(&body)
         .send()
         .await
         .map_err(|e| format!("Snowflake request failed: {}", e))?;

      if !response.status().is_success() {
         let status = response.status();
         let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
         return Err(format!("Snowflake API error ({}): {}", status, error_text));
      }

      let resp: SnowflakeResponse = response
         .json()
         .await
         .map_err(|e| format!("Failed to parse Snowflake response: {}", e))?;

      if resp.code == "090001" {
         // Success
         Ok(resp
            .data
            .unwrap_or_default()
            .into_iter()
            .map(|row| {
               row.into_iter()
                  .map(|val| match val {
                     serde_json::Value::String(s) if s.is_empty() => serde_json::Value::Null,
                     other => other,
                  })
                  .collect()
            })
            .collect())
      } else {
         // Check for async result
         if let Some(ref handle) = resp.statement_handle {
            let status_url = format!(
               "{}{}",
               self.api_base_url(),
               resp
                  .statement_status_url
                  .as_deref()
                  .unwrap_or(&format!("/api/v2/statements/{}", handle))
            );
            self.wait_for_result(&status_url).await
         } else {
            Err(format!(
               "Snowflake query error (code {}): {}",
               resp.code,
               resp.message.unwrap_or_default()
            ))
         }
      }
   }

   async fn wait_for_result(
      &self,
      status_url: &str,
   ) -> Result<Vec<Vec<serde_json::Value>>, String> {
      let jwt = self.generate_jwt()?;
      let max_attempts = 30;
      let mut delay_ms = 500;

      for _attempt in 0..max_attempts {
         tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;

         let response = self
            .http_client
            .get(status_url)
            .header("Authorization", format!("Bearer {}", jwt))
            .header("User-Agent", "athas")
            .send()
            .await
            .map_err(|e| format!("Snowflake status request failed: {}", e))?;

         if !response.status().is_success() {
            let status = response.status();
            let error_text = response
               .text()
               .await
               .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!(
               "Snowflake status API error ({}): {}",
               status, error_text
            ));
         }

         let resp: SnowflakeResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Snowflake status response: {}", e))?;

         if resp.code == "090001" {
            return Ok(resp
               .data
               .unwrap_or_default()
               .into_iter()
               .map(|row| {
                  row.into_iter()
                     .map(|val| match val {
                        serde_json::Value::String(s) if s.is_empty() => serde_json::Value::Null,
                        other => other,
                     })
                     .collect()
               })
               .collect());
         }

         delay_ms = (delay_ms * 2).min(10000);
      }

      Err("Snowflake query timed out waiting for results".to_string())
   }

   async fn execute_and_get_columns(
      &self,
      statement: &str,
   ) -> Result<(Vec<String>, Vec<Vec<serde_json::Value>>), String> {
      let rows = self.execute_sql(statement).await?;

      // For Snowflake, we need a separate DESCRIBE to get column names.
      // Instead, we'll try a heuristic: if the query is a SELECT, we can
      // add LIMIT 0 and parse the response metadata, but the REST API
      // doesn't expose column info directly in a convenient way.
      //
      // For practical purposes, we'll execute the query and derive column
      // names from a separate DESCRIBE if the statement is a table name,
      // or just return numbered columns as a fallback.
      let columns = if rows.is_empty() {
         Vec::new()
      } else {
         (0..rows[0].len())
            .map(|i| format!("COLUMN_{}", i + 1))
            .collect()
      };

      Ok((columns, rows))
   }
}

fn compute_public_key_fingerprint(pem: &str) -> Result<String, String> {
   use rsa::pkcs1::DecodeRsaPrivateKey;
   use rsa::pkcs8::DecodePrivateKey;
   use rsa::pkcs8::EncodePublicKey;

   let private_key = rsa::RsaPrivateKey::from_pkcs8_pem(pem.trim())
      .or_else(|_| rsa::RsaPrivateKey::from_pkcs1_pem(pem.trim()))
      .map_err(|e| format!("Failed to parse RSA private key: {}", e))?;

   let public_key = rsa::RsaPublicKey::from(&private_key);
   let der = public_key
      .to_public_key_der()
      .map_err(|e| format!("Failed to DER-encode public key: {}", e))?;

   let mut hasher = Sha256::new();
   hasher.update(der.as_bytes());
   let hash = hasher.finalize();

   use base64ct::{Base64, Encoding};
   Ok(Base64::encode_string(&hash))
}

#[derive(Debug, Deserialize)]
struct SnowflakeResponse {
   #[serde(default)]
   code: String,
   #[serde(default)]
   message: Option<String>,
   #[serde(default)]
   data: Option<Vec<Vec<serde_json::Value>>>,
   #[serde(rename = "statementHandle", default)]
   statement_handle: Option<String>,
   #[serde(rename = "statementStatusUrl", default)]
   statement_status_url: Option<String>,
}

pub async fn get_snowflake_tables(
   connection_id: String,
   manager: &crate::ConnectionManager,
) -> Result<Vec<TableInfo>, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let rows = conn.execute_sql(
        "SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = CURRENT_SCHEMA() ORDER BY TABLE_TYPE, TABLE_NAME"
    ).await?;

   Ok(rows
      .iter()
      .filter_map(|row| {
         let name = row.first()?.as_str()?.to_string();
         let kind = row
            .get(1)
            .and_then(|v| v.as_str())
            .unwrap_or("table")
            .to_lowercase()
            .replace("base table", "table");
         Some(TableInfo {
            name,
            kind,
            table_name: None,
         })
      })
      .collect())
}

pub async fn query_snowflake(
   connection_id: String,
   query: String,
   manager: &crate::ConnectionManager,
) -> Result<QueryResult, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let (columns, rows) = conn.execute_and_get_columns(&query).await?;

   Ok(QueryResult { columns, rows })
}

pub async fn query_snowflake_filtered(
   connection_id: String,
   params: FilteredQueryParams,
   manager: &crate::ConnectionManager,
) -> Result<FilteredQueryResult, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let table = escape_identifier(&params.table);

   // Build WHERE clause with :pN placeholders, then inline values for Snowflake REST API
   let mut offset = 0;
   let (where_clause, where_params) = build_where_clause_generic(
      &params.filters,
      &params.search_term,
      &params.search_columns,
      "AND",
      escape_identifier,
      |i| format!(":p{}", i),
      &mut offset,
   );
   let where_clause = inline_placeholders(&where_clause, &where_params);

   // Count
   let count_sql = format!("SELECT COUNT(*) FROM {} {}", table, where_clause);
   let count_rows = conn.execute_sql(&count_sql).await?;
   let total_count = count_rows
      .first()
      .and_then(|row| row.first())
      .and_then(|v| v.as_i64())
      .unwrap_or(0);

   // Data
   let order_clause = if let Some(ref sort_col) = params.sort_column {
      let direction = if params.sort_direction.to_uppercase() == "DESC" {
         "DESC"
      } else {
         "ASC"
      };
      format!("ORDER BY {} {}", escape_identifier(sort_col), direction)
   } else {
      String::new()
   };

   let (page_size, row_offset) = normalized_pagination(params.page_size, params.offset);
   let data_sql = format!(
      "SELECT * FROM {} {} {} LIMIT {} OFFSET {}",
      table, where_clause, order_clause, page_size, row_offset
   );

   let (columns, rows) = conn.execute_and_get_columns(&data_sql).await?;

   Ok(FilteredQueryResult {
      columns,
      rows,
      total_count,
   })
}

fn inline_placeholders(clause: &str, params: &[String]) -> String {
   let mut result = clause.to_string();
   for (i, param) in params.iter().enumerate() {
      let placeholder = format!(":p{}", i + 1);
      let escaped = format!("'{}'", param.replace('\'', "''"));
      result = result.replacen(&placeholder, &escaped, 1);
   }
   result
}

pub async fn execute_snowflake(
   connection_id: String,
   statement: String,
   manager: &crate::ConnectionManager,
) -> Result<i64, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let rows = conn.execute_sql(&statement).await?;
   Ok(rows.len() as i64)
}

pub async fn get_snowflake_table_schema(
   connection_id: String,
   table: String,
   manager: &crate::ConnectionManager,
) -> Result<Vec<ColumnInfo>, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let sql = format!(
      "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, 0 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{}' ORDER BY ORDINAL_POSITION",
      table.replace('\'', "''")
   );

   let rows = conn.execute_sql(&sql).await?;

   Ok(rows
      .iter()
      .map(|row| ColumnInfo {
         name: row
            .first()
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
         r#type: row
            .get(1)
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
         notnull: row.get(2).and_then(|v| v.as_str()).unwrap_or("YES") == "NO",
         default_value: row.get(3).and_then(|v| v.as_str()).map(|s| s.to_string()),
         primary_key: row
            .get(4)
            .and_then(|v| v.as_i64())
            .map(|v| v != 0)
            .unwrap_or(false),
      })
      .collect())
}

pub async fn get_snowflake_foreign_keys(
   connection_id: String,
   table: String,
   manager: &crate::ConnectionManager,
) -> Result<Vec<ForeignKeyInfo>, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let sql = format!(
      r#"SELECT fk.column_name, pk.table_name, pk.column_name
           FROM information_schema.referential_constraints rc
           JOIN information_schema.key_column_usage fk ON rc.constraint_name = fk.constraint_name
           JOIN information_schema.key_column_usage pk ON rc.unique_constraint_name = pk.constraint_name
           WHERE fk.table_name = '{}'"#,
      table.replace('\'', "''")
   );

   let rows = conn.execute_sql(&sql).await?;

   Ok(rows
      .iter()
      .map(|row| ForeignKeyInfo {
         from_column: row
            .first()
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
         to_table: row
            .get(1)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
         to_column: row
            .get(2)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
      })
      .collect())
}

pub async fn insert_snowflake_row(
   connection_id: String,
   table: String,
   columns: Vec<String>,
   values: Vec<serde_json::Value>,
   manager: &crate::ConnectionManager,
) -> Result<i64, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let col_str: Vec<String> = columns.iter().map(|c| escape_identifier(c)).collect();
   let val_list: Vec<String> = values
      .iter()
      .map(|v| match v {
         serde_json::Value::Null => "NULL".to_string(),
         serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
         serde_json::Value::Number(n) => n.to_string(),
         serde_json::Value::Bool(b) => (if *b { "TRUE" } else { "FALSE" }).to_string(),
         other => format!("'{}'", other.to_string().replace('\'', "''")),
      })
      .collect();

   let sql = format!(
      "INSERT INTO {} ({}) VALUES ({})",
      escape_identifier(&table),
      col_str.join(", "),
      val_list.join(", ")
   );

   let rows = conn.execute_sql(&sql).await?;
   Ok(rows.len() as i64)
}

pub async fn update_snowflake_row(
   connection_id: String,
   table: String,
   set_columns: Vec<String>,
   set_values: Vec<serde_json::Value>,
   where_column: String,
   where_value: serde_json::Value,
   manager: &crate::ConnectionManager,
) -> Result<i64, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let set_clauses: Vec<String> = set_columns
      .iter()
      .enumerate()
      .map(|(i, c)| {
         let val = set_values
            .get(i)
            .map(|v| match v {
               serde_json::Value::Null => "NULL".to_string(),
               serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
               serde_json::Value::Number(n) => n.to_string(),
               serde_json::Value::Bool(b) => (if *b { "TRUE" } else { "FALSE" }).to_string(),
               other => format!("'{}'", other.to_string().replace('\'', "''")),
            })
            .unwrap_or_else(|| "NULL".to_string());
         format!("{} = {}", escape_identifier(c), val)
      })
      .collect();

   let where_val = match &where_value {
      serde_json::Value::Null => "NULL".to_string(),
      serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
      serde_json::Value::Number(n) => n.to_string(),
      serde_json::Value::Bool(b) => (if *b { "TRUE" } else { "FALSE" }).to_string(),
      other => format!("'{}'", other.to_string().replace('\'', "''")),
   };

   let sql = format!(
      "UPDATE {} SET {} WHERE {} = {}",
      escape_identifier(&table),
      set_clauses.join(", "),
      escape_identifier(&where_column),
      where_val
   );

   conn.execute_sql(&sql).await?;
   Ok(1)
}

pub async fn delete_snowflake_row(
   connection_id: String,
   table: String,
   where_column: String,
   where_value: serde_json::Value,
   manager: &crate::ConnectionManager,
) -> Result<i64, String> {
   let pool_arc = manager
      .get_pool(&connection_id)
      .await
      .ok_or("Not connected")?;
   let conn = match pool_arc.as_ref() {
      crate::DatabasePool::Snowflake(c) => c,
      _ => return Err("Invalid pool type".to_string()),
   };

   let where_val = match &where_value {
      serde_json::Value::Null => "NULL".to_string(),
      serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
      serde_json::Value::Number(n) => n.to_string(),
      serde_json::Value::Bool(b) => (if *b { "TRUE" } else { "FALSE" }).to_string(),
      other => format!("'{}'", other.to_string().replace('\'', "''")),
   };

   let sql = format!(
      "DELETE FROM {} WHERE {} = {}",
      escape_identifier(&table),
      escape_identifier(&where_column),
      where_val
   );

   conn.execute_sql(&sql).await?;
   Ok(1)
}
