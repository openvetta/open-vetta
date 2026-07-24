package org.vetta.android.core.model

enum class ChatRole {
    System,
    User,
    Assistant,
    ;

    fun toApiValue(): String =
        when (this) {
            System -> "system"
            User -> "user"
            Assistant -> "assistant"
        }

    companion object {
        fun fromApi(value: String): ChatRole =
            when (value.lowercase()) {
                "system" -> System
                "assistant" -> Assistant
                else -> User
            }
    }
}

data class ChatMessage(
    val role: ChatRole,
    val content: String,
)

/**
 * Gateway 流式事件。UI 层按序消费即可拼出 assistant 气泡。
 */
sealed class ChatStreamEvent {
    data class Delta(val text: String) : ChatStreamEvent()

    data class Finished(
        val finishReason: String?,
        val usage: TokenUsage? = null,
    ) : ChatStreamEvent()

    data object Done : ChatStreamEvent()

    data class Error(val exception: Throwable) : ChatStreamEvent()
}

data class TokenUsage(
    val promptTokens: Int? = null,
    val completionTokens: Int? = null,
    val totalTokens: Int? = null,
)
