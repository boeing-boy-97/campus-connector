import { firestoreMock, messagingMock, resetAllMocks, storageMock } from './setup';
import { ChatService } from '../services/chat.service';
import { COLLECTIONS } from '../../../../shared/constants';
import { MatchStatus, MessageMediaType } from '../../../../shared/enums';

const MATCH_ID = 'match-1';

function seedMatch(status: MatchStatus = MatchStatus.ACTIVE) {
  firestoreMock.seed(COLLECTIONS.MATCHES, MATCH_ID, {
    student_a_id: 'alice',
    student_b_id: 'bob',
    participant_ids: ['alice', 'bob'],
    college_id: 'college-1',
    status,
  });
}

function seedStudents() {
  for (const id of ['alice', 'bob']) {
    firestoreMock.seed(COLLECTIONS.STUDENTS, id, {
      id,
      college_id: 'college-1',
      full_name: id === 'alice' ? 'Alice Example' : 'Bob Example',
      verification_status: 'approved',
      is_active: true,
    });
  }
}

beforeEach(() => {
  resetAllMocks();
  seedStudents();
  seedMatch();
});

describe('ChatService.validateMatchParticipant', () => {
  it('accepts a participant and reports the other party', async () => {
    const { recipientId } = await ChatService.validateMatchParticipant(MATCH_ID, 'alice');
    expect(recipientId).toBe('bob');
  });

  it('rejects a non-participant', async () => {
    await expect(ChatService.validateMatchParticipant(MATCH_ID, 'eve'))
      .rejects.toThrow(/permission/i);
  });

  it('rejects an unmatched conversation', async () => {
    seedMatch(MatchStatus.UNMATCHED);
    await expect(ChatService.validateMatchParticipant(MATCH_ID, 'alice'))
      .rejects.toThrow(/no longer active/i);
  });

  it('rejects an unknown match', async () => {
    await expect(ChatService.validateMatchParticipant('nope', 'alice'))
      .rejects.toThrow(/not found/i);
  });
});

describe('ChatService.sendMessage', () => {
  it('stores a text message, updates the match preview and increments unread', async () => {
    const messageId = await ChatService.sendMessage({
      matchId: MATCH_ID,
      senderId: 'alice',
      text: 'Hello Bob',
    });

    expect(firestoreMock.raw(COLLECTIONS.MESSAGES, messageId)).toMatchObject({
      match_id: MATCH_ID,
      sender_id: 'alice',
      text: 'Hello Bob',
      read_at: null,
      is_deleted: false,
    });

    const match = firestoreMock.raw(COLLECTIONS.MATCHES, MATCH_ID)!;
    expect(match.last_message_preview).toBe('Hello Bob');
    expect(match.unread_count_bob).toBe(1);
    expect(match.unread_count_alice).toBeUndefined();
  });

  it('notifies the recipient', async () => {
    await ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'alice', text: 'Ping' });

    const notifications = Object.values(firestoreMock.dump(COLLECTIONS.NOTIFICATIONS));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ user_id: 'bob', title: 'Alice Example' });
  });

  it('requires text or media', async () => {
    await expect(ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'alice' }))
      .rejects.toThrow(/either text or media/i);
  });

  it('rejects a message longer than the shared limit', async () => {
    await expect(ChatService.sendMessage({
      matchId: MATCH_ID,
      senderId: 'alice',
      text: 'x'.repeat(2001),
    })).rejects.toThrow(/maximum length/i);
  });

  it('truncates a long preview but keeps the full message body', async () => {
    const text = 'y'.repeat(120);
    const messageId = await ChatService.sendMessage({
      matchId: MATCH_ID, senderId: 'alice', text,
    });

    expect(firestoreMock.raw(COLLECTIONS.MESSAGES, messageId)!.text).toBe(text);
    expect(String(firestoreMock.raw(COLLECTIONS.MATCHES, MATCH_ID)!.last_message_preview).length)
      .toBeLessThanOrEqual(60);
  });

  describe('media validation', () => {
    const path = `chat_media/${MATCH_ID}/photo.jpg`;

    it('accepts an owned upload of an allowed type', async () => {
      storageMock.put(path, {
        contentType: 'image/jpeg',
        size: 2048,
        metadata: { uploader_id: 'alice', match_id: MATCH_ID },
      });

      const messageId = await ChatService.sendMessage({
        matchId: MATCH_ID, senderId: 'alice', mediaPath: path,
      });

      expect(firestoreMock.raw(COLLECTIONS.MESSAGES, messageId)).toMatchObject({
        media_path: path,
        media_type: MessageMediaType.IMAGE,
      });
    });

    it('rejects a path belonging to a different match', async () => {
      const foreign = 'chat_media/other-match/photo.jpg';
      storageMock.put(foreign, {
        metadata: { uploader_id: 'alice', match_id: 'other-match' },
      });

      await expect(ChatService.sendMessage({
        matchId: MATCH_ID, senderId: 'alice', mediaPath: foreign,
      })).rejects.toThrow(/invalid chat media path/i);
    });

    it('rejects a path that traverses into a sub-directory', async () => {
      await expect(ChatService.sendMessage({
        matchId: MATCH_ID,
        senderId: 'alice',
        mediaPath: `chat_media/${MATCH_ID}/nested/photo.jpg`,
      })).rejects.toThrow(/invalid chat media path/i);
    });

    it('rejects media uploaded by someone else', async () => {
      storageMock.put(path, {
        metadata: { uploader_id: 'bob', match_id: MATCH_ID },
      });

      await expect(ChatService.sendMessage({
        matchId: MATCH_ID, senderId: 'alice', mediaPath: path,
      })).rejects.toThrow(/does not belong to the sender/i);
    });

    it('rejects a disallowed content type', async () => {
      storageMock.put(path, {
        contentType: 'application/pdf',
        metadata: { uploader_id: 'alice', match_id: MATCH_ID },
      });

      await expect(ChatService.sendMessage({
        matchId: MATCH_ID, senderId: 'alice', mediaPath: path,
      })).rejects.toThrow(/not supported/i);
    });

    it('rejects an oversized upload', async () => {
      storageMock.put(path, {
        contentType: 'video/mp4',
        size: 26 * 1024 * 1024,
        metadata: { uploader_id: 'alice', match_id: MATCH_ID },
      });

      await expect(ChatService.sendMessage({
        matchId: MATCH_ID, senderId: 'alice', mediaPath: path,
      })).rejects.toThrow(/not supported/i);
    });

    it('rejects a path with no corresponding object', async () => {
      await expect(ChatService.sendMessage({
        matchId: MATCH_ID, senderId: 'alice', mediaPath: path,
      })).rejects.toThrow(/does not exist/i);
    });
  });
});

describe('ChatService.markRead', () => {
  it('marks only the other party’s unread messages and clears the counter', async () => {
    await ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'alice', text: 'one' });
    await ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'alice', text: 'two' });
    await ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'bob', text: 'reply' });

    const marked = await ChatService.markRead(MATCH_ID, 'bob');

    expect(marked).toBe(2);
    const messages = Object.values(firestoreMock.dump(COLLECTIONS.MESSAGES));
    expect(messages.filter((message) => message.sender_id === 'alice')
      .every((message) => message.read_at !== null)).toBe(true);
    // Bob's own message stays unread from Alice's perspective.
    expect(messages.find((message) => message.sender_id === 'bob')!.read_at).toBeNull();
    expect(firestoreMock.raw(COLLECTIONS.MATCHES, MATCH_ID)!.unread_count_bob).toBe(0);
  });

  it('still clears a stale counter when nothing is unread', async () => {
    firestoreMock.seed(COLLECTIONS.MATCHES, MATCH_ID, {
      ...firestoreMock.raw(COLLECTIONS.MATCHES, MATCH_ID)!,
      unread_count_bob: 5,
    });

    const marked = await ChatService.markRead(MATCH_ID, 'bob');

    expect(marked).toBe(0);
    expect(firestoreMock.raw(COLLECTIONS.MATCHES, MATCH_ID)!.unread_count_bob).toBe(0);
  });

  it('refuses to mark read on a match the caller is not in', async () => {
    await expect(ChatService.markRead(MATCH_ID, 'eve')).rejects.toThrow(/permission/i);
  });
});

describe('ChatService.deleteMessage', () => {
  it('soft-deletes the sender’s own message and removes its attachment', async () => {
    const path = `chat_media/${MATCH_ID}/photo.jpg`;
    storageMock.put(path, {
      contentType: 'image/png',
      size: 512,
      metadata: { uploader_id: 'alice', match_id: MATCH_ID },
    });

    const messageId = await ChatService.sendMessage({
      matchId: MATCH_ID, senderId: 'alice', text: 'look', mediaPath: path,
    });

    await ChatService.deleteMessage(messageId, 'alice');

    expect(firestoreMock.raw(COLLECTIONS.MESSAGES, messageId)).toMatchObject({
      is_deleted: true,
      text: null,
      media_path: null,
    });
    expect(storageMock.deleted).toContain(path);
  });

  it('refuses to let the recipient delete the sender’s message', async () => {
    const messageId = await ChatService.sendMessage({
      matchId: MATCH_ID, senderId: 'alice', text: 'mine',
    });

    await expect(ChatService.deleteMessage(messageId, 'bob'))
      .rejects.toThrow(/only the sender/i);
  });

  it('rejects an unknown message', async () => {
    await expect(ChatService.deleteMessage('missing', 'alice')).rejects.toThrow(/not found/i);
  });
});

describe('ChatService.getMediaUploadUrl', () => {
  it('issues a scoped upload URL for an allowed type', async () => {
    const result = await ChatService.getMediaUploadUrl({
      matchId: MATCH_ID,
      userId: 'alice',
      contentType: 'image/jpeg',
      fileSize: 1024,
    });

    expect(result.file_path.startsWith(`chat_media/${MATCH_ID}/`)).toBe(true);
    expect(result.upload_headers['x-goog-meta-uploader_id']).toBe('alice');
    expect(result.upload_headers['x-goog-meta-match_id']).toBe(MATCH_ID);
  });

  it('rejects an unsupported content type', async () => {
    await expect(ChatService.getMediaUploadUrl({
      matchId: MATCH_ID, userId: 'alice', contentType: 'application/zip', fileSize: 10,
    })).rejects.toThrow(/unsupported file type/i);
  });

  it('rejects an oversized file up front', async () => {
    await expect(ChatService.getMediaUploadUrl({
      matchId: MATCH_ID,
      userId: 'alice',
      contentType: 'video/mp4',
      fileSize: 30 * 1024 * 1024,
    })).rejects.toThrow(/exceeds the maximum/i);
  });

  it('rejects a non-participant', async () => {
    await expect(ChatService.getMediaUploadUrl({
      matchId: MATCH_ID, userId: 'eve', contentType: 'image/png', fileSize: 10,
    })).rejects.toThrow(/permission/i);
  });
});

describe('push delivery degradation', () => {
  it('persists the in-app notification even when the device push fails', async () => {
    firestoreMock.seed(COLLECTIONS.STUDENTS, 'bob', {
      ...firestoreMock.raw(COLLECTIONS.STUDENTS, 'bob')!,
      fcm_token: 'stale-token',
    });
    messagingMock.failWith = 'messaging/registration-token-not-registered';

    await ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'alice', text: 'hi' });

    expect(Object.values(firestoreMock.dump(COLLECTIONS.NOTIFICATIONS))).toHaveLength(1);
    // The stale token is cleared so it is not retried forever.
    expect(firestoreMock.raw(COLLECTIONS.STUDENTS, 'bob')!.fcm_token).toBeNull();
  });

  it('sends a real push when a valid token is registered', async () => {
    firestoreMock.seed(COLLECTIONS.STUDENTS, 'bob', {
      ...firestoreMock.raw(COLLECTIONS.STUDENTS, 'bob')!,
      fcm_token: 'valid-token',
    });

    await ChatService.sendMessage({ matchId: MATCH_ID, senderId: 'alice', text: 'hey' });

    expect(messagingMock.sent).toHaveLength(1);
    expect(messagingMock.sent[0]).toMatchObject({ token: 'valid-token', title: 'Alice Example' });
  });
});
