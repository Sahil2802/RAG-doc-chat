-- Migration: add message_count to conversations and triggers to maintain it
BEGIN;
-- Add message_count column
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;
-- Create increment function
CREATE OR REPLACE FUNCTION increment_conversation_message_count() RETURNS TRIGGER AS $$ BEGIN
UPDATE conversations
SET message_count = COALESCE(message_count, 0) + 1
WHERE id = NEW.conversation_id;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Create decrement function
CREATE OR REPLACE FUNCTION decrement_conversation_message_count() RETURNS TRIGGER AS $$ BEGIN
UPDATE conversations
SET message_count = GREATEST(COALESCE(message_count, 0) - 1, 0)
WHERE id = OLD.conversation_id;
RETURN OLD;
END;
$$ LANGUAGE plpgsql;
-- Create triggers
DO $$ BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_trigger
  WHERE tgname = 'increment_message_count_after_insert'
) THEN CREATE TRIGGER increment_message_count_after_insert
AFTER
INSERT ON messages FOR EACH ROW EXECUTE FUNCTION increment_conversation_message_count();
END IF;
IF NOT EXISTS (
  SELECT 1
  FROM pg_trigger
  WHERE tgname = 'decrement_message_count_after_delete'
) THEN CREATE TRIGGER decrement_message_count_after_delete
AFTER DELETE ON messages FOR EACH ROW EXECUTE FUNCTION decrement_conversation_message_count();
END IF;
END;
$$;
COMMIT;