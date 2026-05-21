import { Layout as AntdLayout } from 'antd';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

const { Content } = AntdLayout;

const Layout = () => {
  return (
    <AntdLayout style={{ minHeight: '100vh' }}>
      <Navigation />
      <AntdLayout style={{ marginLeft: 200 }}>
        <Content
          style={{
            padding: 24,
            minHeight: '100vh',
            background: '#f5f5f5',
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 24,
              borderRadius: 8,
              minHeight: 'calc(100vh - 48px)',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </AntdLayout>
    </AntdLayout>
  );
};

export default Layout;
