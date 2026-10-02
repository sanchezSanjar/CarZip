/** where an uploaded image belongs. Fixed by the server: the client never chooses a folder or file name. */
export enum UploadTarget {
	MEMBER = 'member', // profile photo
	CAR = 'car', // car listing photos (agents only)
	ARTICLE = 'article', // board article image (agents and admins)
}
