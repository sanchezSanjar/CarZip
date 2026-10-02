# CarZip API — Frontend Guide

Everything the web (and later mobile) frontend needs to talk to the CarZip backend: how to connect and log in, every GraphQL query and mutation with who may call it, the business rules the server enforces, image upload, live chat, and errors.

The exact types (every field, every enum value) are always available from the server itself. See [Exploring the schema](#exploring-the-schema). This guide explains what the schema can't: **who** can call what, **which rules** apply, and **in which order** to call things.

---

## Contents

1. [Basics](#1-basics)
2. [Login and the access token](#2-login-and-the-access-token)
3. [Errors](#3-errors)
4. [Lists and pagination](#4-lists-and-pagination)
5. [Members and accounts](#5-members-and-accounts)
6. [SMS codes (OTP)](#6-sms-codes-otp)
7. [Cars](#7-cars)
8. [Image upload (REST)](#8-image-upload-rest)
9. [Test drives](#9-test-drives)
10. [Likes, comments, follows, views](#10-likes-comments-follows-views)
11. [Board articles](#11-board-articles)
12. [Personal block (agents)](#12-personal-block-agents)
13. [Notifications](#13-notifications)
14. [Notices, FAQ and terms](#14-notices-faq-and-terms)
15. [Admin](#15-admin)
16. [Live chat (WebSocket)](#16-live-chat-websocket)
17. [Enums](#17-enums)

---

## 1. Basics

|                      |                                                                                |
| -------------------- | ------------------------------------------------------------------------------ |
| GraphQL endpoint     | `POST http(s)://<host>:<PORT_API>/graphql`                                     |
| Image upload         | `POST /upload/image`, `POST /upload/images` (REST, multipart)                  |
| Images are served at | `/uploads/...` (full URLs are returned by the upload API)                      |
| Live chat            | `ws(s)://<host>:<PORT_API>?token=<accessToken>`                                |
| Dates                | ISO 8601 strings in UTC, e.g. `2026-10-03T09:00:00.000Z` (`DateTime` scalar)   |
| Ids                  | MongoDB ObjectId strings (24 hex chars). A malformed id returns `BAD_REQUEST`. |

**Roles.** Every member has a `memberType`:

| Role    | Who                 | Can do                                                                       |
| ------- | ------------------- | ---------------------------------------------------------------------------- |
| guest   | not logged in       | browse cars, agents, articles, notices; read the chat                        |
| `USER`  | buyer               | like, comment, follow agents, request test drives, chat                      |
| `AGENT` | verified car dealer | post and manage own cars, answer test drives, write articles, personal block |
| `ADMIN` | CarZip staff        | approve agents, moderate everything, write notices                           |

In the tables below, **Who** means: `public` = anyone, guests included (logged-in callers may get extra fields such as `meLiked`); `logged in` = any role; otherwise the listed roles only.

### Exploring the schema

The GraphQL Playground is enabled: open `http://localhost:<PORT_API>/graphql` in a browser to browse every type and run queries. Code generators (e.g. GraphQL Code Generator) can read the schema from the same URL by introspection.

---

## 2. Login and the access token

Send the token on every request that needs a logged-in member:

```
Authorization: Bearer <accessToken>
```

- **Lifetime:** 30 days. There is no refresh token yet; when it expires, the user logs in again.
- **Read fresh every request:** the server re-reads the member on every request. A token stops working immediately when the member is blocked or deleted, or when the password is changed or reset.
- **New token in the response:** these calls return a fresh `accessToken` on the member. Store it and replace the old one:
  - `login`
  - `signup` (USER only)
  - `updateMember` (the token carries the nick)
  - `changePassword` (every other session is logged out)
- **Agents after signup:** a new agent gets **no token**. Their account is `PENDING` until an admin approves it; then they log in normally.

```graphql
mutation {
	login(input: { memberNick: "carlover", memberPassword: "secret123" }) {
		_id
		memberNick
		memberType
		memberStatus
		accessToken
	}
}
```

`login` accepts **either** `memberNick` **or** `memberPhone` (not both), plus `memberPassword`.

| Login result                                       | Meaning                                            |
| -------------------------------------------------- | -------------------------------------------------- |
| member with `accessToken`                          | logged in                                          |
| `UNAUTHENTICATED` "Wrong nick or password!"        | same message for a wrong nick and a wrong password |
| `FORBIDDEN` "Your agent account is under review…"  | agent still `PENDING`                              |
| `FORBIDDEN` "Your agent application was rejected…" | agent `REJECTED` (message includes the reason)     |
| `FORBIDDEN` blocked / unavailable                  | member `BLOCK` or `DELETE`                         |

---

## 3. Errors

GraphQL errors arrive in the standard `errors` array (usually with HTTP 200):

```json
{
	"errors": [
		{
			"message": "limit must not be greater than 100",
			"path": ["getCars"],
			"extensions": { "code": "BAD_REQUEST", "errors": ["...", "..."] }
		}
	],
	"data": null
}
```

- **`message`:** a human-readable sentence, safe to show to the user.
- **`extensions.errors`:** only present when several input rules failed at once; it contains all of them, so you can show each error under its form field.
- **`extensions.code`:** one of:

| code                                           | When                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `BAD_REQUEST`                                  | invalid input, or the action isn't allowed in the current state                      |
| `UNAUTHENTICATED`                              | no token, invalid or expired token, wrong login                                      |
| `FORBIDDEN`                                    | wrong role, or blocked (globally or personally)                                      |
| `NOT_FOUND`                                    | the item doesn't exist, or you may not see it                                        |
| `TOO_MANY_REQUESTS`                            | SMS code limits                                                                      |
| `GRAPHQL_VALIDATION_FAILED` / `BAD_USER_INPUT` | the query itself is wrong (unknown field, bad enum value, missing required argument) |
| `INTERNAL_SERVER_ERROR`                        | unexpected; the message is always "Something went wrong!"                            |

REST endpoints (upload) return Nest's standard JSON error: `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`.

---

## 4. Lists and pagination

**Page-based lists** (most lists) take `page` (from 1) and `limit` (1–100) and return:

```graphql
{ list { ... } metaCounter { total } }
```

`metaCounter[0].total` is the total number of matches, for page numbers. With no matches you get `list: []` and `metaCounter: []`: an empty result, never an error.

**Car search (`getCars`) uses a cursor** for "load more" / infinite scroll:

1. The first request has no `cursor`.
2. The response has `nextCursor`; pass it as `cursor` to get the next page.
3. `nextCursor: null` means there are no more cars.
4. A cursor belongs to the sort it was made with. If the user changes the sort or direction, start again without a cursor; otherwise you get `BAD_REQUEST`.

`sort` / `direction`: where `sort` is a `String`, only the values listed in each section are accepted. `direction` is `ASC` or `DESC`.

---

## 5. Members and accounts

| Operation                           | Who       | Purpose                                                                      |
| ----------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `signup(input: MemberInput)`        | public    | create a USER or AGENT (phone must be SMS-verified first, see §6)            |
| `login(input: LoginInput)`          | public    | see §2                                                                       |
| `getMember(targetId)`               | public    | a profile                                                                    |
| `getAgents(input: AgentsInquiry)`   | public    | list of ACTIVE agents                                                        |
| `updateMember(input: MemberUpdate)` | logged in | edit own profile; returns a new token                                        |
| `changePassword(input)`             | logged in | `oldPassword`, `newPassword`; returns a new token, other sessions logged out |
| `changeMemberPhone(input)`          | logged in | `newPhone` (SMS-verified with `CHANGE_PHONE`), `memberPassword`              |
| `likeTargetMember(memberId)`        | logged in | like / un-like a profile (toggle)                                            |

**Signup.**

1. Verify the phone: `requestOtp` + `verifyOtp` with purpose `SIGNUP` (§6).
2. Within **15 minutes**, call `signup` with the same phone.

```graphql
mutation {
	signup(
		input: {
			memberNick: "carlover"
			memberPassword: "secret123"
			memberPhone: "01012345678"
			memberType: USER
			memberFullName: "Kim Minsu"
		}
	) {
		_id
		memberStatus
		accessToken
	}
}
```

| Field                             | Rule                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `memberNick`                      | 3–12 chars, letters, digits and `_`, unique                    |
| `memberPassword`                  | 6–30 chars                                                     |
| `memberPhone`                     | Korean mobile, digits only: `01012345678`, unique              |
| `memberType`                      | `USER` (default) or `AGENT`; never `ADMIN`                     |
| `memberFullName`                  | 2–50 chars; required for USER                                  |
| `agentCompany`                    | 2–100 chars; required for AGENT                                |
| `agentBusinessNo`                 | `123-45-67890` (dashes optional), unique; optional for now     |
| `agentBusinessCard`               | image URL (upload it first, target `member`); optional for now |
| `contactPhone`, `contactWhatsapp` | phone number (`02-123-4567`, `+82 10 …`); agents only          |
| `contactEmail`                    | email; agents only                                             |
| `contactTelegram`, `contactKakao` | 2–50 chars; agents only                                        |

- **USER:** gets `memberStatus: ACTIVE` and an `accessToken`.
- **AGENT:** gets `memberStatus: PENDING` and **no token**. Show "under review, usually within 24 hours".

**Public vs private profile fields.** Everyone sees the public fields. Only the member themself and admins also see `memberPhone`, `memberFullName`, `memberWarnings`, `memberBlocks`, `agentBusinessNo`, `agentBusinessCard`, `agentRejectReason` and `deletedAt`; for anyone else these come back `null`.

**Viewer flags on `getMember`** (logged-in viewers):

- `meLiked`: `[ { myFavorite: true } ]` if I liked this profile, `[]` if not.
- `meFollowed`: same idea, for following.
- `meBlocked`: only when the viewer is an AGENT. `true` / `false` drives the Block / Unblock button; `null` for everyone else.

Opening a profile while logged in counts one view per viewer (never your own).

**`getAgents`:** `search: { text }` matches part of the nick. `sort`: `createdAt`, `updatedAt`, `memberCars`, `memberLikes`, `memberViews`, `memberRank`.

**`updateMember` fields:** `memberNick`, `memberFullName`, `memberImage` (upload URL, target `member`), `memberAddress` (≤200), `memberDesc` (≤500), and for agents the contact fields. Send an empty string to clear a contact field. The phone and password have their own mutations; company and business data can't be changed here.

---

## 6. SMS codes (OTP)

Used in three places: **signup**, **forgot password**, **change phone**.

| Operation                                             | Who                                | Returns                   |
| ----------------------------------------------------- | ---------------------------------- | ------------------------- |
| `requestOtp(input: { otpPhone, otpPurpose })`         | public (`CHANGE_PHONE`: logged in) | a message string          |
| `verifyOtp(input: { otpPhone, otpPurpose, otpCode })` | public                             | `{ message, resetToken }` |
| `resetPassword(input: { resetToken, newPassword })`   | public                             | a message string          |

`otpPurpose`: `SIGNUP` · `RESET_PASSWORD` · `CHANGE_PHONE`.

**Rules:**

- **Expiry:** the code is 6 digits and expires after **3 minutes**; requesting a new code cancels the previous one.
- **Attempts:** 5 wrong attempts and the code is dead; request a new one.
- **Limits (`TOO_MANY_REQUESTS`):** 1 code per minute, 5 per hour per phone, 20 per hour per IP.
- **`SIGNUP` / `CHANGE_PHONE`:** fail with "This phone number is already registered!" if the number is taken.
- **`RESET_PASSWORD`:** always answers "If this number is registered, a code has been sent", whether or not the number exists.

**Forgot password flow:**

1. `requestOtp(phone, RESET_PASSWORD)`.
2. `verifyOtp(phone, RESET_PASSWORD, code)` returns a `resetToken`, valid for **10 minutes**.
3. `resetPassword(resetToken, newPassword)`.
4. The user logs in again; all old tokens are invalid.

This is also how an **agent created by an admin** sets their first password (§15).

**Change phone flow:**

1. `requestOtp(newPhone, CHANGE_PHONE)`, logged in.
2. `verifyOtp(newPhone, CHANGE_PHONE, code)`.
3. `changeMemberPhone(newPhone, memberPassword)`.

---

## 7. Cars

| Operation                               | Who                    | Purpose                                                        |
| --------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| `getCarCatalog`                         | public                 | brand → model list for the "Add car" form and the model filter |
| `getCars(input: CarsInquiry)`           | public                 | search ACTIVE cars (cursor pagination)                         |
| `getCar(carId)`                         | public                 | car detail                                                     |
| `getFavorites(input: { page, limit })`  | logged in              | cars I liked                                                   |
| `getVisited(input: { page, limit })`    | logged in              | cars I opened, latest visit first                              |
| `likeTargetCar(carId)`                  | logged in              | like / un-like (toggle)                                        |
| `createCar(input: CarInput)`            | AGENT                  | new listing                                                    |
| `updateCar(input: CarUpdate)`           | AGENT (own cars)       | edit, pause, re-activate, sell, delete                         |
| `confirmCarListing(carId)`              | AGENT (own ACTIVE car) | "still for sale", without editing                              |
| `getAgentCars(input: AgentCarsInquiry)` | AGENT                  | my cars, any status (`search.carStatus` filter)                |

Every car comes with `agentData` (the dealer's public profile and contacts), and for logged-in viewers `meLiked`. Favorites and recently viewed show only ACTIVE and SOLD cars.

### Searching (`getCars`)

```graphql
query {
	getCars(
		input: {
			limit: 20
			sort: PRICE
			direction: ASC
			search: { brandList: [HYUNDAI, KIA], market: DOMESTIC, priceRange: { start: 10000000, end: 30000000 } }
		}
	) {
		list {
			_id
			carTitle
			carPrice
			carImages
			agentData {
				memberNick
				agentCompany
			}
			meLiked {
				myFavorite
			}
		}
		nextCursor
	}
}
```

**Sorting:** `sort` is `CREATED_AT` (default) · `PRICE` · `PRICE_USD` · `MILEAGE` · `YEAR` · `LIKES` · `VIEWS` · `RANK`. Sorting by `PRICE` hides cars without a KRW price (export-only cars); `PRICE_USD` hides cars without a USD price.

**Filters (`search`), all optional:**

- **Lists (match any value):** `brandList`, `modelList`, `typeList`, `colorList`, `locationList`, `conditionList`, `fuelList`, `transmissionList`. An empty list means no filter.
- **`optionList`:** the car must have **all** of them.
- **`market`:**
  - `DOMESTIC` → cars sold in Korea (DOMESTIC + BOTH)
  - `EXPORT` → EXPORT + BOTH
  - `BOTH` → only cars listed for both
- **Ranges:** `priceRange` (KRW), `priceUsdRange`, `mileageRange`, `yearRange`, each `{ start, end }` (≥ 0).
- **Flags:** `barter`, `rent`, `testDrive`. `true` = only cars offering it.
- **`agentId`:** cars of one dealer.
- **`text`:** 2–50 chars, matched against title, model and description.

### Creating a car (`createCar`)

1. Upload the photos first (§8, target `car`) and put the returned `url`s in `carImages` (1–20).
2. Pick `carModel` from `getCarCatalog` for the chosen brand. Only brand `OTHER` takes a free-text model (≤50 chars).

| Field                       | Rule                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `carTitle`                  | 5–100 chars                                                                                                                                            |
| `carAddress`                | 3–150 chars                                                                                                                                            |
| `carDesc`                   | ≤ 3000 chars                                                                                                                                           |
| `carYear`                   | 1990 … next year                                                                                                                                       |
| `carMileage`                | 0 … 2,000,000 km                                                                                                                                       |
| `carMarket`                 | `DOMESTIC` → `carPrice` (KRW) required · `EXPORT` → `carPriceUsd` required · `BOTH` → both required. The dealer sets each price; nothing is converted. |
| `exportAgreed`              | must be `true` for `EXPORT` / `BOTH`: the dealer accepts that export is fully their responsibility (show this checkbox)                                |
| `carRent` + `carRentPrice`  | rent price (KRW per day) required when `carRent: true`; **not allowed** for `EXPORT`-only cars                                                         |
| `carBarter`, `carTestDrive` | booleans                                                                                                                                               |
| `carOptions`                | list of `CarOption`                                                                                                                                    |

A new car is `ACTIVE` immediately.

### Changing a car (`updateCar`)

Send `_id` plus only the fields that change. The whole car is validated again after the change.

| `carStatus` change | Effect                                                                               |
| ------------------ | ------------------------------------------------------------------------------------ |
| `ACTIVE` → `HOLD`  | paused, hidden from search                                                           |
| `HOLD` → `ACTIVE`  | listed again; **not** possible when an admin put it on hold (`carHoldReason` is set) |
| → `SOLD`           | final, no more changes                                                               |
| → `DELETE`         | removed from the dealer's listings                                                   |

When a car becomes `HOLD`, `SOLD` or `DELETE`, its open test drives are cancelled and the buyers are notified.

**Stale listings:** if an ACTIVE car isn't edited or confirmed for 30 days, the dealer gets a `LISTING_CHECK` notification ("Is … still for sale?"). Offer a **"Still for sale"** button that calls `confirmCarListing`. `carConfirmedAt` shows the last confirmation.

**Export disclaimer:** cars with `carMarket` `EXPORT` or `BOTH` should show that export is the dealer's responsibility and CarZip is only a marketplace.

---

## 8. Image upload (REST)

Images are uploaded over REST, not GraphQL. **Logged in only** (send the `Authorization` header).

| Endpoint              | Form fields                         | Returns                        |
| --------------------- | ----------------------------------- | ------------------------------ |
| `POST /upload/image`  | `file` (one image), `target`        | `{ url, thumbnailUrl }`        |
| `POST /upload/images` | `files` (up to 20 images), `target` | `[{ url, thumbnailUrl }, ...]` |

- **`target`:**
  - `member`: profile photo; anyone logged in.
  - `car`: listing photos; AGENT or ADMIN.
  - `article`: article image; AGENT or ADMIN.
- **Formats:** jpeg, png and webp; **max 10 MB per file**.
- **What the server stores:** it re-encodes every image to WebP and removes location (GPS) data.
- **`images` is all-or-nothing:** one bad file fails the whole request, and the error names that file.
- **Which URL goes where:** save `url` in `memberImage` / `carImages` / `articleImage` / `agentBusinessCard`, and use `thumbnailUrl` in lists. `carImages` and `articleImage` accept **only** URLs from this API; always upload first for the others too.
- **Unused uploads:** images never attached to anything are deleted after about a day.

```js
const form = new FormData();
form.append('target', 'car');
photos.forEach((file) => form.append('files', file));
const res = await fetch(`${API}/upload/images`, {
	method: 'POST',
	headers: { Authorization: `Bearer ${token}` },
	body: form,
});
```

---

## 9. Test drives

| Operation                                                              | Who                             | Purpose                                    |
| ---------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ |
| `requestTestDrive(input: { carId, testDriveDate, testDriveMessage? })` | USER                            | ask the dealer for a date                  |
| `updateTestDrive(input: { _id, testDriveStatus })`                     | USER or AGENT (own test drives) | answer / cancel / complete                 |
| `getMyTestDrives(input: TestDrivesInquiry)`                            | USER                            | my requests (with `carData`, `sellerData`) |
| `getAgentTestDrives(input: TestDrivesInquiry)`                         | AGENT                           | my inbox (with `carData`, `buyerData`)     |

Statuses: `REQUEST` → `CONFIRM` / `REJECT` / `CANCEL`; `CONFIRM` → `COMPLETE` / `CANCEL`.

**Requesting:**

- The car must be ACTIVE with `carTestDrive: true`.
- Not allowed on your own car, or if the dealer blocked you.
- `testDriveDate` must be in the future, within **60 days**.
- `testDriveMessage` is at most 300 characters.
- One open test drive per car; at most **10** open requests per buyer.

**Who can change what:**

| Who                 | From      | To         | When                                           |
| ------------------- | --------- | ---------- | ---------------------------------------------- |
| dealer              | `REQUEST` | `CONFIRM`  | before the date, car still ACTIVE              |
| dealer              | `REQUEST` | `REJECT`   | any time; the buyer may request another date   |
| dealer              | `CONFIRM` | `COMPLETE` | only **after** the date                        |
| buyer               | `REQUEST` | `CANCEL`   | any time                                       |
| buyer **or** dealer | `CONFIRM` | `CANCEL`   | any time, also after the date (e.g. a no-show) |

**Buyer's phone number:** `buyerData.memberPhone` is filled **only after the dealer confirms**, and only in the dealer's view. Before that, the dealer sees the nick and the message.

**Automatic changes, with both sides notified:**

- An unanswered `REQUEST` whose date passes becomes `CANCEL`.
- A reminder goes out about 24 h before a confirmed test drive.
- About 3 h after it, the dealer is asked to mark it complete or cancel it.
- Open test drives are cancelled when the car is sold, paused or deleted, or when the buyer or dealer is blocked by an admin.

`TestDrivesInquiry`:

- `search: { testDriveStatus }`
- `sort`: `createdAt`, `testDriveDate`

---

## 10. Likes, comments, follows, views

| Operation                                                                                   | Who                     | Notes                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `likeTargetCar(carId)` / `likeTargetBoardArticle(articleId)` / `likeTargetMember(memberId)` | logged in               | toggle: call again to un-like; returns the item with the new count. Not your own items.    |
| `getComments(input: CommentsInquiry)`                                                       | public                  | `search: { commentRefId }` (a car, article or member id); `sort`: `createdAt`, `updatedAt` |
| `createComment(input: { commentGroup, commentContent, commentRefId })`                      | logged in               | 1–500 chars; the target must be ACTIVE                                                     |
| `updateComment(input: { _id, commentContent })`                                             | logged in (own comment) | text only; only admins delete comments                                                     |
| `subscribe(input: "<agentId>")`                                                             | logged in               | follow an ACTIVE **agent** (only agents can be followed; not yourself)                     |
| `unsubscribe(input: "<agentId>")`                                                           | logged in               |                                                                                            |
| `getMemberFollowers(input: FollowInquiry)`                                                  | public                  | `search: { followingId }`: who follows this member                                         |
| `getMemberFollowings(input: FollowInquiry)`                                                 | public                  | `search: { followerId }`: whom this member follows                                         |

**Personal block:** if the owner (an agent) blocked the caller, liking, commenting, following and requesting test drives on that agent's items return `FORBIDDEN`. See §12.

**Views:** opening a car, article or profile while logged in counts one view per member; your own items never count.

**Viewer flags in follow lists:** each row has `meLiked` and `meFollowed` for the logged-in viewer.

---

## 11. Board articles

| Operation                                       | Who                      | Purpose                                                                                                             |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `getBoardArticles(input: BoardArticlesInquiry)` | public                   | ACTIVE articles; `search: { articleCategory, text, memberId }`                                                      |
| `getBoardArticle(articleId)`                    | public                   | one article (counts a view)                                                                                         |
| `createBoardArticle(input)`                     | AGENT, ADMIN             | `articleCategory`, `articleTitle` (3–100), `articleContent` (3–5000), `articleImage` (upload URL, target `article`) |
| `updateBoardArticle(input)`                     | AGENT (own), ADMIN (any) | edit, or `articleStatus: DELETE` to delete                                                                          |
| `likeTargetBoardArticle(articleId)`             | logged in                | toggle                                                                                                              |

`articleCategory`: `FREE` · `RECOMMEND` · `NEWS` · `HUMOR`.

`sort`: `createdAt`, `updatedAt`, `articleLikes`, `articleViews`, `articleComments`.

---

## 12. Personal block (agents)

| Operation                             | Who   | Purpose                                          |
| ------------------------------------- | ----- | ------------------------------------------------ |
| `blockMember(memberId)`               | AGENT | block a member on **my** cars and profile        |
| `unblockMember(memberId)`             | AGENT |                                                  |
| `getMyBlocks(input: { page, limit })` | AGENT | my blocked members (`blockedData`), newest first |

- **What a blocked member can't do:** like, comment, follow or request test drives on that agent's things. They can still browse everything and use the rest of CarZip.
- **Not allowed:** blocking yourself, an admin, or a deleted member. Blocking twice gives "You already blocked this member."
- **No notification:** nobody is notified of a block.
- **The button:** use `getMember(...).meBlocked` to show Block / Unblock.

---

## 13. Notifications

| Operation                                            | Who       | Purpose                                                                                              |
| ---------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `getNotifications(input: NotificationsInquiry)`      | logged in | my notifications, newest first; `search: { notificationStatus, notificationGroup }`                  |
| `getUnreadNotificationCount`                         | logged in | number for the bell badge                                                                            |
| `markNotificationsRead(input: { notificationIds? })` | logged in | mark these (1–100 ids) as read, or **all** if `notificationIds` is omitted; returns how many changed |

Each notification has:

- `notificationType`, `notificationTitle` and `notificationDesc`, ready to display
- `authorData`: the person who caused it, public profile
- `carId` / `articleId`: what to open when tapped
- `notificationStatus`: `WAIT` (unread) or `READ`

| Type                                | Sent to        | When                                                                |
| ----------------------------------- | -------------- | ------------------------------------------------------------------- |
| `LIKE`                              | owner          | someone liked their car, article or profile (once per person)       |
| `COMMENT`                           | owner          | new comment                                                         |
| `FOLLOW`                            | agent          | new follower (once per person)                                      |
| `TEST_DRIVE`                        | the other side | every test-drive step, reminder and follow-up                       |
| `AGENT_APPLICATION`                 | admins         | new agent signup; daily reminder for applications waiting over 48 h |
| `AGENT_APPROVED` / `AGENT_REJECTED` | applicant      | admin decision (the reason is in `notificationDesc`)                |
| `CAR_MODERATED`                     | dealer         | an admin held (with reason), deleted or restored their car          |
| `LISTING_CHECK`                     | dealer         | "Is this car still for sale?"                                       |

Notifications don't arrive live yet: poll `getUnreadNotificationCount`, e.g. on page change or every minute. Read notifications are deleted automatically after 90 days, and any notification after a year.

---

## 14. Notices, FAQ and terms

| Operation                           | Who    | Purpose                                                                           |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `getNotices(input: NoticesInquiry)` | public | published notices; `search: { noticeCategory }`; `sort`: `createdAt`, `updatedAt` |
| `getNotice(noticeId)`               | public | one published notice                                                              |

`noticeCategory`: `NOTICE` (announcements) · `FAQ` · `TERMS` (terms of service, privacy policy).

`noticeContent` is **plain text** (up to 20,000 chars). Render it as text, never as HTML. Keep line breaks with CSS `white-space: pre-line`.

---

## 15. Admin

All admin operations require `memberType: ADMIN`.

| Operation                                                                             | Purpose                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getAllMembersByAdmin(input: MembersInquiry)`                                         | all members; `search: { memberStatus, memberType, text }`; `sort` adds `memberWarnings`, `memberBlocks`. Pending agent applications: `search: { memberType: AGENT, memberStatus: PENDING }, sort: "createdAt", direction: ASC` |
| `updateMemberByAdmin(input: { _id, memberType?, memberStatus?, agentRejectReason? })` | approve an agent (`ACTIVE`), reject (`REJECTED` + reason 5–300 chars), `BLOCK`, `DELETE`. Admin accounts (including your own) can't be changed here.                                                                           |
| `createAgentByAdmin(input: AgentInputByAdmin)`                                        | create an ACTIVE, approved agent directly. No password is set: tell the dealer to use **"Forgot password"** with their phone to set one (§6).                                                                                  |
| `getAllCarsByAdmin(input: AllCarsInquiry)`                                            | all cars; `search: { carStatus, locationList, agentId }`                                                                                                                                                                       |
| `updateCarByAdmin(input: { _id, carStatus, carHoldReason? })`                         | `HOLD` (reason 5–300 chars, required), `DELETE`, or `ACTIVE` to restore. The dealer is notified.                                                                                                                               |
| `removeCarByAdmin(carId)`                                                             | remove for good; only a car already in `DELETE`                                                                                                                                                                                |
| `getAllBoardArticlesByAdmin(input)`                                                   | all articles; `search: { articleStatus, articleCategory }`                                                                                                                                                                     |
| `updateBoardArticleByAdmin(input: { _id, articleStatus })`                            | `DELETE` or restore (`ACTIVE`)                                                                                                                                                                                                 |
| `removeBoardArticleByAdmin(articleId)`                                                | remove for good; only an article already in `DELETE`                                                                                                                                                                           |
| `removeCommentByAdmin(commentId)`                                                     | delete a comment                                                                                                                                                                                                               |
| `createNotice(input: { noticeCategory, noticeTitle, noticeContent })`                 | publish (title 1–100, content 1–20,000)                                                                                                                                                                                        |
| `updateNotice(input: { _id, ... })`                                                   | edit; `noticeStatus`: `ACTIVE` published · `HOLD` draft · `DELETE` hidden                                                                                                                                                      |
| `getAllNoticesByAdmin(input)`                                                         | all notices including drafts; `search: { noticeCategory, noticeStatus }`                                                                                                                                                       |
| `getNotice(noticeId)`                                                                 | admins can also open drafts and hidden notices                                                                                                                                                                                 |
| `removeNoticeByAdmin(noticeId)`                                                       | remove for good; only a notice already in `DELETE`                                                                                                                                                                             |

**Side effects to tell admins about in the UI:**

- **Blocking an agent:** puts their ACTIVE cars on HOLD.
- **Deleting an agent:** deletes their cars.
- **Either one:** cancels their open test drives.
- **Removing a car or article for good:** also removes its likes, comments, views, test drives and notifications.

---

## 16. Live chat (WebSocket)

A single public chat room on the API port, using **plain WebSocket** (not Socket.IO).

```js
const ws = new WebSocket(`ws://localhost:3007?token=${token}`); // no token = guest
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	// msg.event: 'getMessages' | 'info' | 'message' | 'error'
};
ws.send(JSON.stringify({ event: 'message', data: 'Hello!' })); // logged-in members only
```

The token goes in the URL because browsers can't set headers on a WebSocket.

**Server → client:**

| `event`       | Payload                                                                              | When                                       |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `getMessages` | `list`: the last 5 messages                                                          | right after you connect                    |
| `info`        | `totalClients`, `memberData` (or `null` for a guest), `action`: `joined` / `left`    | someone joins or leaves                    |
| `message`     | `text`, `memberData` (`_id`, `memberNick`, `memberImage`, `memberType`), `createdAt` | a new message, sent to everyone            |
| `error`       | `message`                                                                            | only to you, when your message was refused |

**Rules:**

- **Guests:** can read, but sending returns `error` "Log in to send messages."
- **Text:** 1–500 characters after trimming.
- **Rate limit:** at most 5 messages per 5 seconds per connection.
- **Close codes** (the server closes the socket):
  - `4001`: invalid or expired token → log in again, or reconnect without a token as a guest
  - `4003`: blocked member
  - `1009`: a frame over 64 KB
- **Account status:** checked on connect and again on every message.

---

## 17. Enums

| Enum                                 | Values                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MemberType`                         | `USER` `AGENT` `ADMIN`                                                                                                                                                                                                                                                                     |
| `MemberStatus`                       | `PENDING` `ACTIVE` `REJECTED` `BLOCK` `DELETE`                                                                                                                                                                                                                                             |
| `CarStatus`                          | `HOLD` `ACTIVE` `SOLD` `DELETE`                                                                                                                                                                                                                                                            |
| `CarType`                            | `SEDAN` `SUV` `HATCHBACK` `COUPE` `CONVERTIBLE` `VAN` `TRUCK`                                                                                                                                                                                                                              |
| `CarBrand`                           | `HYUNDAI` `KIA` `GENESIS` `CHEVROLET` `KGM` `RENAULT` `BMW` `MERCEDES` `AUDI` `VOLKSWAGEN` `VOLVO` `TESLA` `LEXUS` `TOYOTA` `PORSCHE` `MINI` `LAND_ROVER` `FORD` `JEEP` `HONDA` `OTHER`                                                                                                    |
| `CarColor`                           | `WHITE` `PEARL_WHITE` `BLACK` `GRAY` `SILVER` `BLUE` `RED` `BROWN` `BEIGE` `GREEN` `OTHER`                                                                                                                                                                                                 |
| `CarCondition`                       | `NEW` `EXCELLENT` `GOOD` `FAIR` `DAMAGED`                                                                                                                                                                                                                                                  |
| `CarFuelType`                        | `GASOLINE` `DIESEL` `LPG` `HYBRID` `PLUG_IN_HYBRID` `ELECTRIC` `HYDROGEN`                                                                                                                                                                                                                  |
| `CarTransmission`                    | `AUTOMATIC` `MANUAL`                                                                                                                                                                                                                                                                       |
| `CarLocation`                        | `SEOUL` `BUSAN` `INCHEON` `DAEGU` `GYEONGJU` `GWANGJU` `CHONJU` `DAEJON` `JEJU`                                                                                                                                                                                                            |
| `CarMarket`                          | `DOMESTIC` `EXPORT` `BOTH`                                                                                                                                                                                                                                                                 |
| `CarOption`                          | `SUNROOF` `PANORAMIC_SUNROOF` `NAVIGATION` `REAR_CAMERA` `AROUND_VIEW` `PARKING_SENSORS` `HEATED_SEATS` `VENTILATED_SEATS` `LEATHER_SEATS` `HEATED_STEERING` `SMART_KEY` `CRUISE_CONTROL` `ADAPTIVE_CRUISE` `LANE_KEEP_ASSIST` `BLIND_SPOT_MONITOR` `HEAD_UP_DISPLAY` `BLACK_BOX` `HIPASS` |
| `CarSort`                            | `CREATED_AT` `PRICE` `PRICE_USD` `MILEAGE` `YEAR` `LIKES` `VIEWS` `RANK`                                                                                                                                                                                                                   |
| `TestDriveStatus`                    | `REQUEST` `CONFIRM` `REJECT` `CANCEL` `COMPLETE`                                                                                                                                                                                                                                           |
| `CommentGroup` / `NotificationGroup` | `MEMBER` `ARTICLE` `CAR`                                                                                                                                                                                                                                                                   |
| `BoardArticleCategory`               | `FREE` `RECOMMEND` `NEWS` `HUMOR`                                                                                                                                                                                                                                                          |
| `NoticeCategory`                     | `NOTICE` `FAQ` `TERMS`                                                                                                                                                                                                                                                                     |
| `NotificationType`                   | `LIKE` `COMMENT` `FOLLOW` `TEST_DRIVE` `AGENT_APPLICATION` `AGENT_APPROVED` `AGENT_REJECTED` `CAR_MODERATED` `LISTING_CHECK`                                                                                                                                                               |
| `NotificationStatus`                 | `WAIT` `READ`                                                                                                                                                                                                                                                                              |
| `OtpPurpose`                         | `SIGNUP` `RESET_PASSWORD` `CHANGE_PHONE`                                                                                                                                                                                                                                                   |
| `Direction`                          | `ASC` `DESC`                                                                                                                                                                                                                                                                               |
