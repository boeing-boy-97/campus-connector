# Campus Connect — Firestore Collection Schema

> **Multi-tenancy model:** Every student row is tagged with `college_id`.
> Every query filtering profiles, matches, or messages MUST include
> `WHERE college_id = current_user.college_id` — enforced at Firestore rules level.

---

## Collection: `colleges`

Represents an institution registered on the platform.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `name` | `string` | Full college name, e.g. "JD College of Engineering" |
| `short_name` | `string` | Short display name, e.g. "JD College" |
| `domain` | `string` | Email domain, e.g. `jdcollege.edu.in` |
| `logo_url` | `string` | URL to college logo in Firebase Storage |
| `primary_color` | `string` | Hex color, e.g. `#1A237E` |
| `secondary_color` | `string` | Hex color, e.g. `#E91E63` |
| `city` | `string` | City name |
| `state` | `string` | State name |
| `verified_status` | `enum` | `pending` \| `approved` \| `rejected` |
| `student_count` | `number` | Approximate enrolled students |
| `created_at` | `timestamp` | Document creation time |
| `approved_at` | `timestamp?` | When admin approved |
| `approved_by` | `string?` | Admin UID who approved |

**Index:** `domain` (unique, for domain lookup during signup)

---

## Collection: `students`

One document per registered student.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Firebase Auth UID |
| `college_id` | `string` | FK → `colleges.id` (THE isolation key) |
| `college_email` | `string` | Verified institutional email |
| `phone` | `string?` | Optional phone number (E.164 format) |
| `full_name` | `string` | Student's full name |
| `branch` | `string` | e.g. "Computer Science", "Mechanical" |
| `year` | `number` | Year of study: 1, 2, 3, 4 |
| `bio` | `string` | Max 500 chars |
| `date_of_birth` | `timestamp` | Must be 18+ years ago |
| `gender` | `enum` | `male` \| `female` \| `other` \| `prefer_not_to_say` |
| `profile_photos` | `string[]` | Array of Storage URLs (max 6) |
| `uniform_verification_photo_url` | `string?` | Private Storage URL (not shown to peers) |
| `verification_status` | `enum` | `pending` \| `approved` \| `rejected` \| `suspended` |
| `intent_flags` | `object` | `{ dating: bool, friendship: bool, study: bool, hackathon: bool, project: bool }` |
| `interests` | `string[]` | List of interests/tags |
| `linkedin_url` | `string?` | Optional LinkedIn profile |
| `github_url` | `string?` | Optional GitHub profile |
| `is_active` | `boolean` | Account active flag |
| `is_profile_complete` | `boolean` | True once all required fields are filled |
| `last_seen` | `timestamp` | Last app activity |
| `fcm_token` | `string?` | Firebase Cloud Messaging token |
| `consent_given_at` | `timestamp` | DPDP Act consent timestamp |
| `consent_version` | `string` | Version of T&C/Privacy Policy consented to |
| `created_at` | `timestamp` | Account creation time |
| `updated_at` | `timestamp` | Last profile update |

**Indexes:**
- `college_id` + `verification_status` (discovery feed)
- `college_id` + `gender` + `verification_status` (filtered discovery)
- `college_id` + `year` + `verification_status`

---

## Collection: `verification_requests`

Tracks uniform/ID photo review workflow.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `student_id` | `string` | FK → `students.id` |
| `college_id` | `string` | Denormalized for admin filtering |
| `uniform_photo_url` | `string` | Private Storage URL |
| `id_card_photo_url` | `string?` | Optional ID card photo URL |
| `review_status` | `enum` | `pending` \| `approved` \| `rejected` |
| `review_notes` | `string?` | Admin feedback on rejection |
| `reviewed_by` | `string?` | Admin UID |
| `submitted_at` | `timestamp` | When student submitted |
| `reviewed_at` | `timestamp?` | When admin reviewed |

**Index:** `review_status` + `submitted_at` (admin queue sorted by oldest first)

---

## Collection: `connect_requests`

Like/interest sent from one student to another.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `from_id` | `string` | Student who sent the like |
| `to_id` | `string` | Student who received the like |
| `college_id` | `string` | Both must be in same college |
| `match_type` | `enum` | `dating` \| `friendship` \| `study` \| `hackathon` \| `project` |
| `status` | `enum` | `pending` \| `accepted` \| `declined` \| `expired` |
| `message` | `string?` | Optional intro message (max 200 chars) |
| `created_at` | `timestamp` | When request was sent |
| `responded_at` | `timestamp?` | When recipient responded |

**Compound index:** `to_id` + `status` + `created_at` (notification inbox)

---

## Collection: `matches`

Created when a connect_request is accepted (mutual).

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `student_a_id` | `string` | FK → `students.id` |
| `student_b_id` | `string` | FK → `students.id` |
| `college_id` | `string` | Both students' college |
| `match_type` | `enum` | `dating` \| `friendship` \| `study` \| `hackathon` \| `project` |
| `status` | `enum` | `active` \| `unmatched` |
| `matched_at` | `timestamp` | When match was created |
| `last_message_at` | `timestamp?` | For chat list sorting |
| `last_message_preview` | `string?` | Truncated last message text |

**Indexes:**
- `student_a_id` + `status` + `last_message_at`
- `student_b_id` + `status` + `last_message_at`

---

## Collection: `messages`

Chat messages within a match.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `match_id` | `string` | FK → `matches.id` |
| `sender_id` | `string` | FK → `students.id` |
| `text` | `string?` | Message text (max 2000 chars) |
| `media_url` | `string?` | Firebase Storage URL for media |
| `media_type` | `enum?` | `image` \| `video` |
| `sent_at` | `timestamp` | Server timestamp |
| `read_at` | `timestamp?` | When recipient read |
| `is_deleted` | `boolean` | Soft delete |

**Index:** `match_id` + `sent_at` (chat message list)

---

## Collection: `reports`

Student reports of inappropriate behavior.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `reporter_id` | `string` | FK → `students.id` |
| `reported_id` | `string` | FK → `students.id` |
| `college_id` | `string` | Denormalized |
| `reason` | `enum` | `harassment` \| `fake_profile` \| `inappropriate_content` \| `spam` \| `other` |
| `description` | `string?` | Additional details (max 1000 chars) |
| `evidence_urls` | `string[]?` | Screenshots if provided |
| `status` | `enum` | `pending` \| `reviewed` \| `action_taken` \| `dismissed` |
| `action_taken` | `string?` | Admin notes on action |
| `reviewed_by` | `string?` | Admin/moderator UID |
| `created_at` | `timestamp` | When report was filed |
| `reviewed_at` | `timestamp?` | When admin reviewed |

**Index:** `status` + `created_at` (admin moderation queue)

---

## Collection: `blocks`

Document ID: `{blocker_id}_{blocked_id}`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | `{blocker_id}_{blocked_id}` |
| `blocker_id` | `string` | FK → `students.id` |
| `blocked_id` | `string` | FK → `students.id` |
| `created_at` | `timestamp` | When block was created |

**Note:** Block is enforced by checking both `{a}_{b}` and `{b}_{a}` documents.

---

## Collection: `notifications`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `user_id` | `string` | Recipient FK → `students.id` |
| `type` | `enum` | `new_match` \| `new_message` \| `connect_request` \| `verification_approved` \| `verification_rejected` |
| `title` | `string` | Notification title |
| `body` | `string` | Notification body |
| `data` | `object?` | Extra payload (match_id, sender_id, etc.) |
| `is_read` | `boolean` | Read status |
| `created_at` | `timestamp` | When notification was created |

---

## Collection: `audit_logs`

Admin actions are logged here. Written by Cloud Functions only.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated doc ID |
| `admin_id` | `string` | Admin UID who took action |
| `action` | `string` | e.g. `approve_verification`, `suspend_student` |
| `target_id` | `string` | Target document ID |
| `target_collection` | `string` | e.g. `students`, `verification_requests` |
| `details` | `object?` | Any extra context |
| `created_at` | `timestamp` | When action was taken |

---

## Security Notes

- **`college_id` on every table** — this is the single enforcement point for college isolation
- **Verification photos** (`uniform_verification_photo_url`) are stored in a private Firebase Storage bucket. The URL is never served to other students — only accessed by Cloud Functions for admin review
- **`consent_given_at`** is required for DPDP Act 2023 compliance
- **Soft deletes** preferred over hard deletes — allows data retention for legal compliance and dispute resolution
