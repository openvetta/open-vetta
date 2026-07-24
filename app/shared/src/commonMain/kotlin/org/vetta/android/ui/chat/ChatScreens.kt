package org.vetta.android.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.vetta.android.core.model.ChatRole
import org.vetta.android.core.model.LlmModel
import org.vetta.android.domain.error.UiError
import org.vetta.android.domain.error.UiErrorAction
import org.vetta.android.domain.session.LocalMessage
import org.vetta.android.domain.session.MessageStatus
import org.vetta.android.ui.components.EmptyState
import org.vetta.android.ui.components.VettaErrorBanner
import org.vetta.android.ui.i18n.Str

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    title: String,
    messages: List<LocalMessage>,
    draft: String,
    isStreaming: Boolean,
    models: List<LlmModel>,
    selectedModel: LlmModel?,
    modelPickerOpen: Boolean,
    globalError: UiError?,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    onOpenDrawer: () -> Unit,
    onOpenMe: () -> Unit,
    onNewChat: () -> Unit,
    onOpenModelPicker: () -> Unit,
    onCloseModelPicker: () -> Unit,
    onSelectModel: (LlmModel) -> Unit,
    onErrorAction: (UiErrorAction) -> Unit,
    onDismissError: () -> Unit,
    onSuggestion: (String) -> Unit,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val isAtBottom by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf true
            last.index >= info.totalItemsCount - 2
        }
    }

    LaunchedEffect(messages.size, messages.lastOrNull()?.content, messages.lastOrNull()?.status) {
        if (isAtBottom && messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(title, maxLines = 1)
                        if (isStreaming) {
                            Text(
                                Str.streaming,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                },
                navigationIcon = {
                    TextButton(onClick = onOpenDrawer) { Text(Str.sessions) }
                },
                actions = {
                    TextButton(onClick = onOpenModelPicker) {
                        Text(selectedModel?.name ?: Str.selectModel, maxLines = 1)
                    }
                    TextButton(onClick = onNewChat) { Text(Str.newChat) }
                    TextButton(onClick = onOpenMe) { Text(Str.me) }
                },
            )
        },
        bottomBar = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .navigationBarsPadding()
                    .imePadding(),
            ) {
                if (globalError != null) {
                    VettaErrorBanner(
                        error = globalError,
                        onDismiss = onDismissError,
                        onAction = onErrorAction,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
                InputDock(
                    value = draft,
                    isStreaming = isStreaming,
                    sendEnabled = draft.isNotBlank() && !isStreaming && selectedModel != null,
                    onValueChange = onDraftChange,
                    onSend = onSend,
                    onStop = onStop,
                )
            }
        },
    ) { padding ->
        Box(
            Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            if (messages.isEmpty()) {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    EmptyState(
                        title = Str.emptyHomeGreeting,
                        subtitle = Str.emptyHomeHint,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(horizontal = 16.dp),
                    ) {
                        listOf(Str.suggestion1, Str.suggestion2, Str.suggestion3).forEach { tip ->
                            AssistChip(
                                onClick = { onSuggestion(tip) },
                                label = { Text(tip, maxLines = 1) },
                            )
                        }
                    }
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(messages, key = { it.id }) { msg ->
                        MessageBubble(msg)
                    }
                }
                if (!isAtBottom) {
                    TextButton(
                        onClick = {
                            scope.launch {
                                listState.animateScrollToItem(messages.lastIndex)
                            }
                        },
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp),
                    ) {
                        Text(Str.newContent)
                    }
                }
            }
        }
    }

    if (modelPickerOpen) {
        ModalBottomSheet(
            onDismissRequest = onCloseModelPicker,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(Str.selectModel, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                if (models.isEmpty()) {
                    EmptyState(title = Str.noModels, subtitle = Str.noModelsHint)
                } else {
                    models.forEach { model ->
                        val selected = model.id == selectedModel?.id
                        Surface(
                            onClick = { onSelectModel(model) },
                            shape = RoundedCornerShape(12.dp),
                            color =
                                if (selected) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                                },
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                        ) {
                            Column(Modifier.padding(14.dp)) {
                                Text(model.name, style = MaterialTheme.typography.titleSmall)
                                val meta =
                                    buildString {
                                        if (model.contextWindow != null) append("上下文 ${model.contextWindow}")
                                        if (model.tags.isNotEmpty()) {
                                            if (isNotEmpty()) append(" · ")
                                            append(model.tags.take(3).joinToString(" / "))
                                        }
                                    }
                                if (meta.isNotEmpty()) {
                                    Text(
                                        meta,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun MessageBubble(message: LocalMessage) {
    val isUser = message.role == ChatRole.User
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier.widthIn(max = 520.dp),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
        ) {
            Surface(
                shape =
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp,
                    ),
                color =
                    if (isUser) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                contentColor =
                    if (isUser) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
            ) {
                Text(
                    text =
                        message.content.ifBlank {
                            when (message.status) {
                                MessageStatus.Streaming -> "…"
                                MessageStatus.Error -> message.errorMessage ?: Str.errorGeneric
                                MessageStatus.Aborted -> "（已停止）"
                                else -> ""
                            }
                        },
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            if (message.status == MessageStatus.Error && !message.errorMessage.isNullOrBlank()) {
                Text(
                    message.errorMessage,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun InputDock(
    value: String,
    isStreaming: Boolean,
    sendEnabled: Boolean,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    Surface(tonalElevation = 2.dp, shadowElevation = 4.dp) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp, max = 140.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                if (value.isEmpty()) {
                    Text(
                        Str.chatPlaceholder,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    textStyle =
                        MaterialTheme.typography.bodyLarge.copy(
                            color = MaterialTheme.colorScheme.onSurface,
                        ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    maxLines = 6,
                )
            }
            Spacer(Modifier.width(8.dp))
            if (isStreaming) {
                Button(onClick = onStop) { Text(Str.stop) }
            } else {
                Button(onClick = onSend, enabled = sendEnabled) { Text(Str.send) }
            }
        }
    }
}
