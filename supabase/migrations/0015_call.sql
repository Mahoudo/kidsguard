-- ============================================================================
-- KidsGuard — consented video/voice call (Jitsi). Parent initiates, child
-- sees an incoming-call prompt and accepts. NOT covert recording.
-- ============================================================================

alter type command_type add value if not exists 'call';
