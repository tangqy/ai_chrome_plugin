import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ServicePanel from './pages/ServicePanel';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <div style={{ padding: '16px', minHeight: '100vh', background: '#f5f5f5' }}>
          <h1>Wujie AI</h1>
          <ServicePanel />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
