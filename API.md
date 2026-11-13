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
17. [Private messages](#17-private-messages)
18. [Push notifications](#18-push-notifications)
19. [Enums](#19-enums)

---

## 1. Basics

|                      |                                                                                |
| -------------------- | ------------------------------------------------------------------------------ |
| GraphQL endpoint     | `POST http(s)://<host>:<PORT_API>/graphql`                                     |
| Image upload         | `POST /upload/image`, `POST /upload/images` (REST, multipart)                  |
| Images are served at | `/uploads/...` (full URLs are returned by the upload API)                      |
| Live chat            | `ws(s)://<host>:<PORT_API>`, then `{ "event": "auth", "data": "<accessToken>" }` |
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

Send the access token on every request that needs a logged-in member:

```
Authorization: Bearer <accessToken>
```

There are two kinds of login. The client picks one with `device` in the `login` / `signup` input:

|                               | Without `device` (old clients)   | With `device` (the website and the mobile app)                                   |
| ----------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `accessToken`                 | JWT, valid **30 days**           | JWT, valid **15 minutes**                                                        |
| `refreshToken`                | `null`                           | random string, valid **60 days**, counted again from every refresh               |
| when the access token expires | log in again                     | `refreshTokens` gives a new pair ([Refresh tokens](#refresh-tokens-mobile-app)) |

- **Read fresh every request:** the server re-reads the member on every request. An access token stops working immediately when the member is blocked or deleted, when the role changes, when the password is changed or reset, and after `logoutAll`.
- **New token in the response:** these calls return a fresh `accessToken` on the member. Store it and replace the old one:
  - `login`
  - `signup` (USER only)
  - `updateMember` (the token carries the nick)
  - `changePassword` (every other session is logged out)

  With a device, `updateMember` and `changePassword` keep the device's session: only the access token changes, the refresh token stays.
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
| `TOO_MANY_REQUESTS` "Too many failed log-in attempts…" | 5 wrong passwords for one account (or 30 from one IP) within 15 minutes; wait 15 minutes |

### Refresh tokens (mobile app)

Log in (or sign up) with a `device`:

```graphql
mutation {
	login(
		input: {
			memberNick: "carlover"
			memberPassword: "secret123"
			device: { deviceId: "3b0c6f1e-6d4a-4c63-9a55-2f7b1c8e9d10", deviceName: "Galaxy S24", devicePlatform: ANDROID }
		}
	) {
		_id
		memberNick
		accessToken
		refreshToken
	}
}
```

| `device` field   | Rule                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `deviceId`       | 8–100 chars. Make it once (e.g. a UUID) and keep it on the device. Logging in again on the same device ends its old session |
| `deviceName`     | optional, 1–100 chars, e.g. the phone model                                                                                  |
| `devicePlatform` | optional: `IOS`, `ANDROID` or `WEB`                                                                                          |

| Operation                     | Who       | Purpose                                                                                                                                   |
| ----------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `refreshTokens(refreshToken)` | public    | `{ accessToken, refreshToken }`: a new pair. The sent refresh token is used up                                                            |
| `logout(refreshToken)`        | public    | ends this device's session; always `true`                                                                                                 |
| `logoutAll`                   | logged in | ends every session of the member and every access token issued until now, on every device and browser (old 30-day tokens too); `true` |

```graphql
mutation {
	refreshTokens(refreshToken: "<refreshToken>") {
		accessToken
		refreshToken
	}
}
```

**Rules for the app:**

- **Storage:** the refresh token in secure storage (Expo `SecureStore`), the access token in memory. The server stores only a hash of the refresh token.
- **When to refresh:** when a request fails with `UNAUTHENTICATED`, call `refreshTokens` once, store **both** new tokens, and retry the request. Refreshing shortly before `exp` (in the access token's payload) works too.
- **One refresh at a time:** each refresh token works **once**. Two refreshes with the same token look like a stolen copy (next point) and log the device out. Let one refresh run and make the other requests wait for its result.
- **Stolen copy (reuse detection):** a refresh token that was already used comes back → the server ends that whole session, for the copy and for the real device. Other devices stay logged in.
- **Refresh fails:** `UNAUTHENTICATED` (expired, used, logged out, password changed or reset) or `FORBIDDEN` (blocked) → delete both tokens and show the login screen.
- **Logout:** call `logout(refreshToken)`, then delete both tokens. The access token itself keeps working until it expires (15 minutes at most), so it must be deleted on the device.
- **Password:** `resetPassword` ends every session. `changePassword` ends every other session; this device keeps its refresh token and gets a new access token.
- **Role change by an admin:** the old access token stops working; `refreshTokens` returns one with the new role.
- **Live chat:** connect with the current access token. When the chat closes with `4001`, refresh and reconnect (§16).

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
| `UNAUTHENTICATED`                              | no token, invalid or expired token, wrong login, used or ended refresh token         |
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
| `getMember(targetId, countView)`    | public    | a profile; `countView: false` reads it without counting a profile view       |
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
| `agentBusinessNo`                 | `123-45-67890` (dashes optional), unique; required for AGENT   |
| `agentBusinessCard`               | image URL (upload it first, target `member`); optional for now |
| `contactPhone`, `contactWhatsapp` | phone number (`02-123-4567`, `+82 10 …`); agents only          |
| `contactEmail`                    | email; agents only                                             |
| `contactTelegram`, `contactKakao` | 2–50 chars; agents only                                        |
| `device`                          | optional, the mobile app: a refresh token too (see §2)         |

- **USER:** gets `memberStatus: ACTIVE` and an `accessToken` (with `device`, also a `refreshToken`).
- **AGENT:** gets `memberStatus: PENDING` and **no token**. Show "under review, usually within 24 hours". Every active admin gets an in-app notification and an SMS about the new application.

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
4. The user logs in again; all old access tokens are invalid and every device session (refresh token) has ended.

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
| `getCarStats`                           | public                 | welcome page numbers: cars for sale (`total`), `dealers`, and counts per `brands` / `types` / `fuels` / `locations` (`{ value, count }`, most first). Cached in Redis for 60 s and cleared whenever a car changes |
| `getCars(input: CarsInquiry)`           | public                 | search ACTIVE cars (cursor pagination)                         |
| `getCar(carId)`                         | public                 | car detail                                                     |
| `getFavorites(input: { page, limit })`  | logged in              | cars I liked                                                   |
| `getVisited(input: { page, limit })`    | logged in              | cars I opened, latest visit first                              |
| `likeTargetCar(carId)`                  | logged in              | like / un-like (toggle); a SOLD car can only be un-liked       |
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
  - `chat`: a photo for a private message (§17); anyone logged in. Deleted about a day after its message.
- **Voice messages** have their own endpoint, `POST /upload/voice` (§17).
- **Formats:** jpeg, png and webp; **max 10 MB per file**.
- **What the server stores:** it re-encodes every image to WebP and removes location (GPS) data.
- **`images` is all-or-nothing:** one bad file fails the whole request, and the error names that file.
- **Which URL goes where:** save `url` in `memberImage` / `carImages` / `articleImage` / `agentBusinessCard`, and use `thumbnailUrl` in lists. `carImages` and `articleImage` accept **only** URLs from this API; always upload first for the others too.
- **Only our uploads:** `carImages`, `articleImage`, `memberImage` and `agentBusinessCard` must be URLs our upload API produced (the matching `target`); any other URL returns `BAD_REQUEST` ("... must be uploaded through CarZip first"). An empty `memberImage` removes the photo.
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
- One open test drive per car; at most **10** open test drives (requested or confirmed) per buyer.

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
| `getMyComments(input: { page, limit })` | logged in | my own comments everywhere, newest first; each has `targetData { title, image }` (the car / article / dealer it is on, null if gone) |
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
- **Blocking ends a follow:** if the blocked member followed the agent, that follow is removed (both counters go down). Unblocking doesn't restore it; they can follow again.
- **Not allowed:** blocking yourself, an admin, or a deleted member. Blocking twice gives "You already blocked this member."
- **Blocking ends open test drives:** the blocked member's open test drives with this agent (requested or confirmed) are cancelled.
- **No notification of the block:** nobody is told about the block itself; a cancelled test drive only says the dealer is no longer available.
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

On the web, poll `getUnreadNotificationCount`, e.g. on page change or every minute; the mobile app also gets each notification as a push (§18). Read notifications are deleted automatically after 90 days, and any notification after a year.

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
| `updateMemberByAdmin(input: { _id, memberType?, memberStatus?, agentRejectReason? })` | approve an agent (`ACTIVE`), reject (`REJECTED` + reason 5–300 chars), `BLOCK`, `DELETE`. Admin accounts (including your own) can't be changed here. A `memberType` change (USER ↔ AGENT) is refused while the member has listed cars or open test drives; their old access token stops working, so they log in again (the mobile app just refreshes, §2). |
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
const ws = new WebSocket('ws://localhost:3007'); // everyone connects as a guest first
ws.onopen = () => ws.send(JSON.stringify({ event: 'auth', data: token })); // logged in: the token as the first message
ws.onmessage = (e) => {
	const msg = JSON.parse(e.data);
	// msg.event: 'getMessages' | 'info' | 'message' | 'error'
};
ws.send(JSON.stringify({ event: 'message', data: 'Hello!' })); // logged-in members only
ws.send(JSON.stringify({ event: 'auth', data: newAccessToken })); // after every refresh (mobile app)
```

**Why the token is a message, not part of the address:** a `?token=` in the address is written to nginx's access log and to proxy logs on the way, so a copy of the token would sit in log files. `ws://host?token=<accessToken>` still works for old clients, but the website and the app send `auth` right after connecting instead.

**New token on an open connection (`auth`):** every message re-checks the token, and the mobile app's access token lasts 15 minutes. After each `refreshTokens`, send `{ "event": "auth", "data": "<new accessToken>" }`: the connection keeps going with the new token, no reconnect. A guest connection becomes a member one the same way (after login). A bad or expired token closes the connection with `4001`.

The token goes in the URL because browsers can't set headers on a WebSocket.

**Server → client:**

| `event`       | Payload                                                                              | When                                       |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `getMessages` | `list`: the last 20 messages of the past 7 days (older ones are deleted; never in the database) | right after you connect                    |
| `info`        | `totalClients`, `memberData` (or `null` for a guest), `action`: `joined` / `left`    | someone joins or leaves                    |
| `message`     | `text`, `memberData` (`_id`, `memberNick`, `memberImage`, `memberType`), `createdAt` | a new message, sent to everyone            |
| `error`       | `message`                                                                            | only to you, when your message was refused |

**Rules:**

- **Guests:** can read, but sending returns `error` "Log in to send messages."
- **Text:** 1–500 characters after trimming.
- **Rate limit:** at most 5 messages per 5 seconds per connection.
- **Close codes** (the server closes the socket):
  - `4001`: invalid or expired token → log in again, or reconnect without a token as a guest. The mobile app's access token lasts 15 minutes: refresh first (§2), then reconnect with the new one
  - `4003`: blocked member
  - `1009`: a frame over 64 KB
- **Account status:** checked on connect and again on every message.

---

## 17. Private messages

Conversations between **a buyer (`USER`) and a dealer (`AGENT`), or between two dealers**, like a messenger: text, photos and voice messages. Everything needs a logged-in member.

| Operation | Purpose |
| --- | --- |
| `startConversation(input: { targetId, carId? })` | opens the conversation with this member, or creates it. `carId`: one of the dealer's cars, shown as the conversation's car |
| `getConversations(input: { page, limit })` | my conversations, latest message first: `partner` (the other side's public profile), `carData`, `lastMessageText`, `myUnread`, `partnerReadAt` |
| `getMessages(input: { conversationId, before?, limit })` | the thread, **newest first**, 1–50 per page. Older page: `before` = `createdAt` of the oldest message shown |
| `sendMessage(input: { conversationId, messageText?, messageImage?, messageAudio?, messageDuration?, carId? })` | a text (up to 1000 characters), a photo (with an optional caption) or a voice message; returns the message (`messageType` `TEXT`, `IMAGE` or `VOICE`) |
| `markConversationRead(conversationId)` | I opened the thread: `myUnread` becomes 0 and the other side sees it as read |
| `getUnreadMessageCount` | the number for the Chat tab badge |

**Who can write to whom:**

- A **buyer** can start a conversation with any ACTIVE dealer.
- A **dealer** can start one with any other ACTIVE dealer. Two dealers have one conversation, whoever writes first.
- A **dealer** can start one with a **buyer** only if the buyer requested a test drive on one of the dealer's cars (any status). After that, both sides reply freely.
- Never buyer to buyer, with an admin, or with yourself: `FORBIDDEN` "Private messages are between a buyer and a dealer, or between two dealers."
- A dealer's personal block (§12) stops the conversation both ways (between two dealers, either one's block): `FORBIDDEN` "You cannot message this member."
- A member who is no longer ACTIVE can't be written to.
- At most **20 messages a minute** per member (`TOO_MANY_REQUESTS`).
- Someone outside a conversation gets `NOT_FOUND` for it; nothing about it is revealed.

**Photos:** upload first with `POST /upload/image`, `target=chat` (any logged-in member, see §8), then send the returned `url` as `messageImage`. Only our own chat uploads are accepted. The list shows a photo as its caption, or "📷 Photo". Show the upload's `thumbnailUrl` (`..._thumb.webp`) in the bubble and the full photo when tapped.

**Voice messages:** record AAC in `.m4a` (the phone apps) or `.webm` (a browser), at most **2 minutes** and 3 MB. Upload with `POST /upload/voice` (form field `file`, any logged-in member), then send the returned `url` as `messageAudio` with `messageDuration` (whole seconds, 1–120). The server checks that the file really is such a recording; only our own uploads are accepted. The list shows "🎤 Voice message".

**Kept 14 days:** each message is deleted 14 days after it was sent, and a conversation 14 days after its last message (the public room in §16 keeps 7 days). A photo or recording is deleted about a day after its message. The text is never written to the server logs.

**Live, over the same WebSocket as §16** (connected with a token): only the two members of the conversation receive

| `event` | Payload | When |
| --- | --- | --- |
| `privateMessage` | `conversationId`, `message` (like `sendMessage` returns) | a new message, to both members (also the sender's other devices) |
| `conversationRead` | `conversationId`, `readAt` | the other side opened the thread: messages sent before `readAt` are read |

Read receipts: a message of mine is **read** when its `createdAt` ≤ the conversation's `partnerReadAt` (or the latest `conversationRead.readAt`).

---

## 18. Push notifications

The mobile app gets push notifications through **Expo's push service**. The app asks the phone for an Expo push token (`expo-notifications`) and sends it here after login.

| Operation | Who | Purpose |
| --- | --- | --- |
| `registerPushToken(input: { token, devicePlatform? })` | logged in | this phone gets pushes for the logged-in member. `token` looks like `ExponentPushToken[...]`. Call it after every login (another member logging in on the same phone takes the token over) |
| `unregisterPushToken(token)` | public | this phone gets no more pushes (e.g. notifications turned off in the app); always `true` |

**What is pushed:**

| When | `title` / `body` | `data` (what to open when tapped) |
| --- | --- | --- |
| a new private message (§17) | the sender's nick / the text, "📷 …" or "🎤 Voice message" | `{ type: "message", conversationId }` |
| every in-app notification (§13): likes, comments, follows, test drives, reminders, agent decisions, listing checks | `notificationTitle` / `notificationDesc` | `{ type: "notification", notificationType, carId?, articleId? }` |

**When a phone stops getting pushes:** the token belongs to the login session it was registered with. `logout` of that session, `logoutAll`, a password reset and a password change (other devices) remove it. Expo reporting the app as uninstalled removes it too, and a phone not seen for 90 days is forgotten.

Sending never blocks or fails the action that caused it. With "enhanced push security" on in the Expo project, set `EXPO_ACCESS_TOKEN` in the server's `.env`.

---

## 19. Enums

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
