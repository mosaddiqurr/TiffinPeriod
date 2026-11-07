-- Online play for Tiffin Period games.
-- One pattern covers every game: tp:<game>:lobby (quick match) and tp:<game>:room:<CODE> (a room for two).
-- Players connect without accounts (anonymous sockets); moves are small JSON messages.
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('tp:%', 'Tiffin Period online play: per-game lobbies and two-player rooms', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;
