import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Role } from '@/generated/prisma/browser';
import { type ThreadExportData } from './export-thread';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: '#111',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 6,
  },
  headerBrand: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#cb1d3d',
  },
  headerTitle: {
    fontSize: 9,
    color: '#6b7280',
    maxWidth: 300,
  },
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#9ca3af',
  },
  meta: {
    marginBottom: 16,
    fontSize: 9,
    color: '#6b7280',
  },
  messageBubble: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 4,
  },
  userBubble: {
    backgroundColor: '#f3f4f6',
  },
  assistantBubble: {
    backgroundColor: '#fef2f4',
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roleLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  userLabel: {
    color: '#374151',
  },
  assistantLabel: {
    color: '#cb1d3d',
  },
  timestamp: {
    fontSize: 8,
    color: '#9ca3af',
  },
  content: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  sourcesHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginTop: 16,
    marginBottom: 6,
    color: '#374151',
  },
  sourceItem: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2,
  },
});

type Props = {
  data: ThreadExportData;
};

export const ThreadPDF = ({ data }: Props) => {
  const title = data.title ?? 'Conversation';
  const exportDate = data.createdAt.toISOString().slice(0, 10);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.headerBrand}>Ragen</Text>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        <View style={styles.meta}>
          <Text>Date: {exportDate}</Text>
          {data.assistantName != null && (
            <Text>Assistant: {data.assistantName}</Text>
          )}
        </View>

        {data.messages.map((msg, i) => {
          const isUser = msg.role === Role.USER;
          const time = msg.createdAt.toISOString().slice(11, 16);
          return (
            <View
              key={i}
              style={[
                styles.messageBubble,
                isUser ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <View style={styles.roleRow}>
                <Text
                  style={[
                    styles.roleLabel,
                    isUser ? styles.userLabel : styles.assistantLabel,
                  ]}
                >
                  {isUser ? 'Użytkownik' : 'Asystent'}
                </Text>
                <Text style={styles.timestamp}>{time}</Text>
              </View>
              <Text style={styles.content}>{msg.content}</Text>
            </View>
          );
        })}

        {data.sources.length > 0 && (
          <View>
            <Text style={styles.sourcesHeading}>Źródła</Text>
            {data.sources.map((s, i) => (
              <Text key={i} style={styles.sourceItem}>
                {'• '}
                {s.fileName}
              </Text>
            ))}
          </View>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};
