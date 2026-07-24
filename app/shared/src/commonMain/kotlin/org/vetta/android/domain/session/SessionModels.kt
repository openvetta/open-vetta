package org.vetta.android.domain.session

import org.vetta.android.core.model.ChatRole

enum class MessageStatus {
    Pending,
    Streaming,
    Complete,
    Error,
    Aborted,
}

data class ChatSession(
    val id: String,
    val title: String,
    val modelId: String?,
    val modelName: String?,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
    val pinned: Boolean = false,
)

data class LocalMessage(
    val id: String,
    val sessionId: String,
    val role: ChatRole,
    val content: String,
    val status: MessageStatus,
    val createdAtEpochMs: Long,
    val errorMessage: String? = null,
)

expect fun nowEpochMs(): Long
