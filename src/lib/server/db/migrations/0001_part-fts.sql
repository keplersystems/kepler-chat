CREATE VIRTUAL TABLE `part_fts` USING fts5(`text`, content=`part`, content_rowid=`rowid`);--> statement-breakpoint
CREATE TRIGGER `part_fts_insert` AFTER INSERT ON `part` BEGIN
  INSERT INTO `part_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;--> statement-breakpoint
CREATE TRIGGER `part_fts_delete` AFTER DELETE ON `part` BEGIN
  INSERT INTO `part_fts`(`part_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
END;--> statement-breakpoint
CREATE TRIGGER `part_fts_update` AFTER UPDATE OF `text` ON `part` BEGIN
  INSERT INTO `part_fts`(`part_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
  INSERT INTO `part_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
