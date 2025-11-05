# Database Backup - Additional Considerations

This document outlines future improvements and considerations for the database backup feature.

## 1. Security

### Backup File Encryption
- **Current**: Backup files are stored as plain SQL/dump files
- **Future Enhancement**: Add encryption option
  ```bash
  spfn db backup --encrypt
  spfn db restore backup.sql.enc --decrypt
  ```
- **Implementation**: Use `openssl` or Node.js crypto module with AES-256
- **Key Management**: Support password-based or keyfile-based encryption

### Access Control
- **Consideration**: Backup files contain sensitive data
- **Recommendation**:
  - `.gitignore` already added to backups directory
  - Ensure proper file permissions (0600) on backup files
  - Consider separate backup storage with restricted access

## 2. Performance

### Large Database Handling
- **Current**: Single-threaded pg_dump
- **Future Enhancement**: Parallel backup for large databases
  ```bash
  spfn db backup --jobs=4
  ```
- **Implementation**: Use pg_dump `--jobs` option for parallel table dumps
- **Benefit**: Significantly faster backups for databases with many tables

### Compression
- **Current**: Custom format (`-f custom`) uses built-in compression
- **Future Enhancement**: Additional compression options
  ```bash
  spfn db backup --compress=gzip
  spfn db backup --compress=brotli
  ```
- **Benefit**: Smaller backup files, faster network transfers

## 3. Automation

### Scheduled Backups
- **Use Case**: Regular automated backups
- **Implementation Options**:

  **Option 1: Cron (Unix/Linux)**
  ```bash
  # Daily backup at 2 AM
  0 2 * * * cd /path/to/project && pnpm spfn db backup
  ```

  **Option 2: systemd Timer (Linux)**
  ```ini
  # /etc/systemd/system/db-backup.timer
  [Unit]
  Description=Daily Database Backup

  [Timer]
  OnCalendar=daily
  OnCalendar=02:00
  Persistent=true

  [Install]
  WantedBy=timers.target
  ```

  **Option 3: GitHub Actions**
  ```yaml
  name: Database Backup
  on:
    schedule:
      - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Manual trigger

  jobs:
    backup:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - run: pnpm install
        - run: pnpm spfn db backup
        - uses: actions/upload-artifact@v3
          with:
            name: db-backup
            path: backups/
  ```

### Backup Rotation
- **Current**: `spfn db backup:clean --keep=N`
- **Future Enhancement**: More sophisticated rotation policies
  ```bash
  # Keep: 7 daily, 4 weekly, 12 monthly
  spfn db backup:clean --policy=7d4w12m
  ```
- **Implementation**: Grandfather-Father-Son (GFS) backup rotation

## 4. Remote Storage

### Cloud Storage Integration
- **Future Enhancement**: Direct upload to cloud storage
  ```bash
  spfn db backup --upload s3://bucket/backups
  spfn db backup --upload gs://bucket/backups
  spfn db backup --upload azure://container/backups
  ```

### Remote Backup Strategies
- **S3 Example**:
  ```bash
  # Current workaround
  pnpm spfn db backup
  aws s3 sync ./backups s3://my-bucket/db-backups
  ```

- **Future CLI Integration**:
  ```typescript
  // packages/cli/src/commands/db.ts
  async function dbBackup(options: {
    upload?: string;  // s3://bucket/path
  }) {
    // ... create backup ...
    if (options.upload) {
      await uploadToCloud(filename, options.upload);
    }
  }
  ```

## 5. Monitoring and Notifications

### Backup Status Notifications
- **Future Enhancement**: Notify on backup success/failure
  ```bash
  spfn db backup --notify slack://webhook-url
  spfn db backup --notify email://admin@example.com
  ```

### Health Checks
- **Implementation**: Send heartbeat after successful backup
  ```bash
  # Using services like healthchecks.io
  spfn db backup --healthcheck https://hc-ping.com/uuid
  ```

## 6. Verification and Testing

### Backup Integrity Checks
- **Future Enhancement**: Verify backup integrity
  ```bash
  spfn db backup:verify backup.sql
  ```
- **Implementation**:
  - Calculate SHA-256 checksum
  - Store checksums in `.backups.index` file
  - Verify before restore

### Restore Testing
- **Recommendation**: Periodically test restores
  ```bash
  # Restore to test database
  DATABASE_URL=postgresql://user:pass@localhost/test_db \
    spfn db restore backup.sql
  ```

## 7. Incremental Backups

### Point-in-Time Recovery (PITR)
- **Future Enhancement**: WAL-based incremental backups
- **Use Case**: Restore to any point in time
- **Implementation**:
  - Use PostgreSQL WAL archiving
  - `pg_basebackup` for base backup
  - Continuous WAL archiving

### Differential Backups
- **Future Enhancement**: Only backup changed data
- **Benefit**: Faster backups, less storage
- **Limitation**: Requires PostgreSQL logical replication or custom tracking

## 8. Multi-Database Support

### Backup Multiple Databases
- **Future Enhancement**: Backup all databases in cluster
  ```bash
  spfn db backup:all
  spfn db backup --databases db1,db2,db3
  ```

### Cross-Database Restore
- **Future Enhancement**: Restore to different database
  ```bash
  spfn db restore backup.sql --to-database new_db_name
  ```

## 9. Metadata and Logging

### Backup Metadata
- **Future Enhancement**: Store backup metadata
  ```json
  {
    "filename": "mydb_2025-01-05_143022.sql",
    "database": "mydb",
    "size": 12345678,
    "timestamp": "2025-01-05T14:30:22Z",
    "schema_version": "0003",
    "pg_version": "16.1",
    "duration_ms": 3421,
    "checksum": "sha256:..."
  }
  ```

### Audit Logs
- **Implementation**: Log all backup operations
  ```
  backups/.audit.log
  2025-01-05 14:30:22 | BACKUP  | mydb_2025-01-05_143022.sql | 12.34 MB | SUCCESS
  2025-01-05 16:15:33 | RESTORE | mydb_2025-01-05_143022.sql | SUCCESS
  2025-01-06 02:00:15 | CLEAN   | deleted 3 old backups | SUCCESS
  ```

## 10. Disaster Recovery

### Offsite Backups
- **Recommendation**: Store backups in multiple locations
  - Primary: Local backups directory
  - Secondary: Cloud storage (S3, GCS, Azure)
  - Tertiary: Different cloud provider or region

### Recovery Time Objective (RTO)
- **Consideration**: How quickly can you restore?
- **Recommendations**:
  - Test restore procedure regularly
  - Document restore steps
  - Maintain backup of restore procedure

### Recovery Point Objective (RPO)
- **Consideration**: How much data loss is acceptable?
- **Recommendations**:
  - Hourly backups for critical data (RPO: 1 hour)
  - Daily backups for normal data (RPO: 24 hours)
  - Combine with WAL archiving for minimal data loss

## Implementation Priority

**High Priority** (Current Release):
- ✅ Basic backup/restore
- ✅ List backups
- ✅ Clean old backups
- ✅ .gitignore for security

**Medium Priority** (Next Release):
- Backup encryption
- Parallel backups (--jobs)
- Backup verification
- Cloud storage integration

**Low Priority** (Future):
- PITR with WAL archiving
- Automated backup rotation policies
- Notification integrations
- Multi-database support

## References

- [PostgreSQL Backup Documentation](https://www.postgresql.org/docs/current/backup.html)
- [pg_dump Manual](https://www.postgresql.org/docs/current/app-pgdump.html)
- [pg_restore Manual](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [Backup Best Practices](https://www.postgresql.org/docs/current/continuous-archiving.html)