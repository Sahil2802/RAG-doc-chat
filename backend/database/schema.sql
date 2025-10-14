-- =====================================================
-- RAG Document Chatbot Schema
-- ChatGPT-like interface with document upload per chat
-- Vector embeddings stored in Pinecone (not Supabase)
-- =====================================================
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- =====================================================
-- CONVERSATIONS (Chat Sessions)
-- =====================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
-- =====================================================
-- MESSAGES (Chat Messages)
-- =====================================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
-- =====================================================
-- DOCUMENTS (Uploaded files per conversation)
-- =====================================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    filename TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    storage_path TEXT NOT NULL,
    -- Supabase Storage path or external URL
    pinecone_namespace TEXT,
    -- Pinecone namespace for isolation (conversation_id)
    chunk_count INTEGER DEFAULT 0,
    -- Number of chunks stored in Pinecone
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    error_message TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX idx_documents_conversation_id ON documents(conversation_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
-- =====================================================
-- DOCUMENT_METADATA (Optional: Track chunks metadata)
-- Store references to Pinecone vector IDs for cleanup
-- =====================================================
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    chunk_index INTEGER NOT NULL,
    pinecone_vector_id TEXT NOT NULL,
    -- ID used in Pinecone
    chunk_text TEXT,
    -- Optional: store original text for reference
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_pinecone_id ON document_chunks(pinecone_vector_id);
-- =====================================================
-- USER_PROFILES (Extended user info - optional)
-- =====================================================
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
-- =====================================================
-- CONVERSATIONS POLICIES
-- =====================================================
-- Users can view only their own conversations
CREATE POLICY "Users can view their own conversations" ON conversations FOR
SELECT USING (auth.uid() = user_id);
-- Users can insert their own conversations
CREATE POLICY "Users can create conversations" ON conversations FOR
INSERT WITH CHECK (auth.uid() = user_id);
-- Users can update their own conversations
CREATE POLICY "Users can update their own conversations" ON conversations FOR
UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Users can delete their own conversations
CREATE POLICY "Users can delete their own conversations" ON conversations FOR DELETE USING (auth.uid() = user_id);
-- =====================================================
-- MESSAGES POLICIES
-- =====================================================
-- Users can view messages in their conversations
CREATE POLICY "Users can view messages in their conversations" ON messages FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM conversations
            WHERE conversations.id = messages.conversation_id
                AND conversations.user_id = auth.uid()
        )
    );
-- Users can insert messages in their conversations
CREATE POLICY "Users can insert messages in their conversations" ON messages FOR
INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM conversations
            WHERE conversations.id = messages.conversation_id
                AND conversations.user_id = auth.uid()
        )
    );
-- =====================================================
-- DOCUMENTS POLICIES
-- =====================================================
-- Users can view documents in their conversations
CREATE POLICY "Users can view their documents" ON documents FOR
SELECT USING (auth.uid() = user_id);
-- Users can upload documents to their conversations
CREATE POLICY "Users can upload documents" ON documents FOR
INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM conversations
            WHERE conversations.id = documents.conversation_id
                AND conversations.user_id = auth.uid()
        )
    );
-- Users can update their documents (e.g., status changes)
CREATE POLICY "Users can update their documents" ON documents FOR
UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Users can delete their documents
CREATE POLICY "Users can delete their documents" ON documents FOR DELETE USING (auth.uid() = user_id);
-- =====================================================
-- DOCUMENT_CHUNKS POLICIES
-- =====================================================
-- Users can view chunks of their documents
CREATE POLICY "Users can view their document chunks" ON document_chunks FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM documents
            WHERE documents.id = document_chunks.document_id
                AND documents.user_id = auth.uid()
        )
    );
-- Users can insert chunks for their documents
CREATE POLICY "Users can insert document chunks" ON document_chunks FOR
INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM documents
            WHERE documents.id = document_chunks.document_id
                AND documents.user_id = auth.uid()
        )
    );
-- Users can delete chunks of their documents
CREATE POLICY "Users can delete document chunks" ON document_chunks FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM documents
        WHERE documents.id = document_chunks.document_id
            AND documents.user_id = auth.uid()
    )
);
-- =====================================================
-- USER_PROFILES POLICIES
-- =====================================================
-- Users can view all profiles (for display names in shared chats, if needed)
CREATE POLICY "Users can view all profiles" ON user_profiles FOR
SELECT USING (true);
-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile" ON user_profiles FOR
INSERT WITH CHECK (auth.uid() = id);
-- Users can update their own profile
CREATE POLICY "Users can update their own profile" ON user_profiles FOR
UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger to auto-update conversations.updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE
UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Trigger to auto-update user_profiles.updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE
UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Function to auto-update conversation updated_at when new message is added
CREATE OR REPLACE FUNCTION update_conversation_timestamp() RETURNS TRIGGER AS $$ BEGIN
UPDATE conversations
SET updated_at = NOW()
WHERE id = NEW.conversation_id;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger to update conversation timestamp on new message
CREATE TRIGGER update_conversation_on_new_message
AFTER
INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();
-- =====================================================
-- STORAGE BUCKET (Run this in Supabase Dashboard -> Storage)
-- =====================================================
-- Create a storage bucket for document uploads
-- Name: 'documents'
-- Public: false (files are private, accessed via signed URLs)
-- 
-- Storage policies (apply in Dashboard or via SQL):
-- 
-- INSERT policy:
-- CREATE POLICY "Users can upload their own documents"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--   bucket_id = 'documents' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );
--
-- SELECT policy:
-- CREATE POLICY "Users can view their own documents"
-- ON storage.objects FOR SELECT
-- USING (
--   bucket_id = 'documents' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );
--
-- DELETE policy:
-- CREATE POLICY "Users can delete their own documents"
-- ON storage.objects FOR DELETE
-- USING (
--   bucket_id = 'documents' AND
--   auth.uid()::text = (storage.foldername(name))[1]
-- );
-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
-- Additional composite indexes for common queries
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_documents_conversation_status ON documents(conversation_id, status);
-- =====================================================
-- SAMPLE QUERIES (for reference)
-- =====================================================
-- Get all conversations for a user (ordered by most recent activity)
-- SELECT * FROM conversations WHERE user_id = auth.uid() ORDER BY updated_at DESC;
-- Get all messages for a conversation
-- SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC;
-- Get all documents for a conversation
-- SELECT * FROM documents WHERE conversation_id = ? ORDER BY uploaded_at DESC;
-- Get conversation with message count
-- SELECT c.*, COUNT(m.id) as message_count
-- FROM conversations c
-- LEFT JOIN messages m ON m.conversation_id = c.id
-- WHERE c.user_id = auth.uid()
-- GROUP BY c.id
-- ORDER BY c.updated_at DESC;
-- =====================================================
-- NOTES
-- =====================================================
-- 1. Pinecone Namespace Strategy:
--    - Use conversation_id as the Pinecone namespace
--    - This isolates document vectors per conversation
--    - Query only the relevant namespace for context retrieval
--
-- 2. Document Processing Workflow:
--    a. User uploads file → store in Supabase Storage
--    b. Create document record with status='processing'
--    c. Backend extracts text, chunks it, generates embeddings
--    d. Store vectors in Pinecone with namespace=conversation_id
--    e. Update document status='ready' and chunk_count
--    f. Store chunk metadata in document_chunks table
--
-- 3. Chat Query Workflow:
--    a. User sends message → insert into messages table
--    b. Get conversation's documents (status='ready')
--    c. Generate embedding for user query
--    d. Query Pinecone with namespace=conversation_id
--    e. Retrieve relevant chunks, build context
--    f. Send to LLM (OpenAI/Anthropic) with context
--    g. Insert assistant response into messages table
--
-- 4. Cleanup on Conversation Delete:
--    - Cascade deletes messages, documents, chunks
--    - Backend job should also delete vectors from Pinecone namespace
--    - Delete files from Supabase Storage