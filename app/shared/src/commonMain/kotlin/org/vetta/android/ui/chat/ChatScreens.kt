package org.vetta.android.ui.chat

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.vetta.android.core.model.ChatRole
import org.vetta.android.core.model.LlmModel
import org.vetta.android.domain.error.UiError
import org.vetta.android.domain.error.UiErrorAction
import org.vetta.android.domain.session.LocalMessage
import org.vetta.android.domain.session.MessageImage
import org.vetta.android.domain.session.MessageStatus
import org.vetta.android.ui.components.EmptyState
import org.vetta.android.ui.components.VettaErrorBanner
import org.vetta.android.ui.i18n.Str
import org.vetta.android.ui.icons.VettaIcons
import org.vetta.android.ui.media.imageBitmapFromBase64
import org.vetta.android.ui.media.rememberImagePicker

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    title: String,
    messages: List<LocalMessage>,
    draft: String,
    pendingImages: List<MessageImage>,
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
    onImagesPicked: (List<MessageImage>) -> Unit,
    onRemovePendingImage: (String) -> Unit,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val launchPicker =
        rememberImagePicker { picked ->
            onImagesPicked(
                picked.map {
                    MessageImage(
                        id = "pending-${it.fileName}-${it.bytes.size}-${it.bytes.hashCode()}",
                        mimeType = it.mimeType,
                        fileName = it.fileName,
                        base64Data = it.toBase64(),
                    )
                },
            )
        }
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

    val canSend =
        !isStreaming &&
            selectedModel != null &&
            (draft.isNotBlank() || pendingImages.isNotEmpty())

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(title, maxLines = 1, style = MaterialTheme.typography.titleMedium)
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
                    IconButton(onClick = onOpenDrawer) {
                        Icon(VettaIcons.Menu, contentDescription = Str.sessions)
                    }
                },
                actions = {
                    TextButton(onClick = onOpenModelPicker) {
                        Text(
                            selectedModel?.name ?: Str.selectModel,
                            maxLines = 1,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                    IconButton(onClick = onNewChat) {
                        Icon(VettaIcons.Add, contentDescription = Str.newChat)
                    }
                    IconButton(onClick = onOpenMe) {
                        Icon(VettaIcons.Person, contentDescription = Str.me)
                    }
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
                if (pendingImages.isNotEmpty()) {
                    PendingImageRow(
                        images = pendingImages,
                        onRemove = onRemovePendingImage,
                    )
                }
                InputDock(
                    value = draft,
                    isStreaming = isStreaming,
                    sendEnabled = canSend,
                    onValueChange = onDraftChange,
                    onSend = onSend,
                    onStop = onStop,
                    onAttach = launchPicker,
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
private fun PendingImageRow(
    images: List<MessageImage>,
    onRemove: (String) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(images, key = { it.id }) { image ->
            Box {
                val bmp = remember(image.id) { imageBitmapFromBase64(image.base64Data) }
                if (bmp != null) {
                    Image(
                        bitmap = bmp,
                        contentDescription = image.fileName ?: Str.attach,
                        modifier =
                            Modifier
                                .size(72.dp)
                                .clip(RoundedCornerShape(10.dp)),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Surface(
                        modifier = Modifier.size(72.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("IMG", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                IconButton(
                    onClick = { onRemove(image.id) },
                    modifier =
                        Modifier
                            .align(Alignment.TopEnd)
                            .size(28.dp),
                ) {
                    Icon(
                        VettaIcons.Close,
                        contentDescription = Str.removeAttachment,
                        modifier = Modifier.size(16.dp),
                    )
                }
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
            modifier = Modifier.widthIn(max = 560.dp),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
        ) {
            if (message.images.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(message.images, key = { it.id }) { image ->
                        val bmp = remember(image.id) { imageBitmapFromBase64(image.base64Data) }
                        if (bmp != null) {
                            Image(
                                bitmap = bmp,
                                contentDescription = image.fileName ?: Str.attach,
                                modifier =
                                    Modifier
                                        .size(120.dp)
                                        .clip(RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Crop,
                            )
                        }
                    }
                }
                if (message.content.isNotBlank() || message.status == MessageStatus.Streaming) {
                    Spacer(Modifier.height(6.dp))
                }
            }
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
                when {
                    isUser -> {
                        Text(
                            text =
                                message.content.ifBlank {
                                    if (message.images.isNotEmpty()) " " else ""
                                },
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    message.content.isBlank() && message.status == MessageStatus.Streaming -> {
                        Text(
                            "…",
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    message.content.isBlank() && message.status == MessageStatus.Error -> {
                        Text(
                            message.errorMessage ?: Str.errorGeneric,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    message.content.isBlank() && message.status == MessageStatus.Aborted -> {
                        Text(
                            "（已停止）",
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    else -> {
                        MarkdownContent(
                            source = message.content,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        )
                    }
                }
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
    onAttach: () -> Unit,
) {
    Surface(tonalElevation = 2.dp, shadowElevation = 4.dp) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            IconButton(onClick = onAttach, enabled = !isStreaming) {
                Icon(VettaIcons.Attach, contentDescription = Str.attach)
            }
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
            Spacer(Modifier.width(4.dp))
            if (isStreaming) {
                FilledIconButton(onClick = onStop) {
                    Icon(VettaIcons.Stop, contentDescription = Str.stop)
                }
            } else {
                FilledIconButton(onClick = onSend, enabled = sendEnabled) {
                    Icon(VettaIcons.Send, contentDescription = Str.send)
                }
            }
        }
    }
}
