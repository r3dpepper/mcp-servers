// Re-export every tool definition. The order matches the plan grouping.

export { account_list } from "./account-list.js";
export { account_add } from "./account-add.js";
export { account_remove } from "./account-remove.js";
export { account_test } from "./account-test.js";

export { folder_list } from "./folder-list.js";
export { folder_create } from "./folder-create.js";

export { search } from "./search.js";
export { get } from "./get.js";
export { get_attachment } from "./get-attachment.js";

export { send } from "./send.js";
export { reply } from "./reply.js";
export { forward } from "./forward.js";
export { draft_create } from "./draft-create.js";
export { draft_list } from "./draft-list.js";

export { move } from "./move.js";
export { delete_email } from "./delete.js";
export { mark } from "./mark.js";

export { batch_delete } from "./batch-delete.js";
export { batch_move } from "./batch-move.js";
export { batch_mark } from "./batch-mark.js";
