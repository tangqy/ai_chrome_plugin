import { Typography, Card, Empty } from 'antd';

const { Title, Text } = Typography;

const AgentPanel = () => {
  return (
    <div>
      <Title level={2}>AI Agent</Title>
      <Card>
        <Empty
          description={
            <Text type="secondary">
              AI Agent 功能正在开发中...
            </Text>
          }
        />
      </Card>
    </div>
  );
};

export default AgentPanel;
