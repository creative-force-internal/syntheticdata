import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar.js';

interface Section {
  id: string;
  title: string;
  icon: string;
}

const SECTIONS: Section[] = [
  { id: 'overview',        title: 'Tổng quan',                          icon: 'lightbulb' },
  { id: 'quick-start',     title: 'Bắt đầu nhanh',                      icon: 'rocket_launch' },
  { id: 'schema',          title: 'Schema & generator',                 icon: 'view_column' },
  { id: 'fk',              title: 'Quan hệ khóa ngoại (FK)',            icon: 'account_tree' },
  { id: 'rules',           title: 'Quy tắc có điều kiện',               icon: 'rule_settings' },
  { id: 'actions',         title: 'Tham chiếu các hành động',           icon: 'play_arrow' },
  { id: 'personas',        title: 'Persona & dữ liệu nhất quán',        icon: 'group' },
  { id: 'reproducibility', title: 'Seed & khả năng tái lập',            icon: 'replay' },
  { id: 'recipes',         title: 'Công thức theo tình huống',          icon: 'restaurant_menu' },
  { id: 'gotchas',         title: 'Mẹo & lỗi thường gặp',               icon: 'warning' },
];

export function HelpVi() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen overflow-hidden">
        <header className="flex items-center justify-between px-4 md:px-8 pl-14 md:pl-8 w-full h-16 sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-surface-container shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[20px]">help_outline</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface">Hướng dẫn</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-[10px] font-label uppercase tracking-widest">
              <Link to="/help" className="text-on-surface-variant hover:text-primary transition-colors">EN</Link>
              <span className="text-on-surface-variant/40">|</span>
              <span className="text-primary font-bold">VI</span>
            </div>
            <span className="font-label text-[10px] uppercase tracking-tighter text-on-surface-variant">
              Đọc khoảng ~10 phút
            </span>
          </div>
        </header>

        <section className="flex-1 overflow-hidden flex">
          {/* Mục lục */}
          <aside className="hidden lg:block w-64 shrink-0 border-r border-surface-container py-8 px-6 overflow-y-auto">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-4">Trên trang này</p>
            <nav className="space-y-1">
              {SECTIONS.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={
                    active === s.id
                      ? 'flex items-center gap-2 px-3 py-2 rounded-md bg-surface-container text-primary font-bold text-xs transition-colors'
                      : 'flex items-center gap-2 px-3 py-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-bright text-xs transition-colors'
                  }
                >
                  <span className="material-symbols-outlined text-[16px]">{s.icon}</span>
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          {/* Nội dung */}
          <div className="flex-1 overflow-y-auto">
            <article className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12 md:space-y-16 pb-16 md:pb-24">
              {/* Hero */}
              <header className="space-y-3 border-b border-outline-variant/10 pb-10">
                <p className="font-label text-[10px] uppercase tracking-widest text-primary">Tài liệu</p>
                <h1 className="text-4xl font-bold font-headline tracking-tight">Cách tạo dữ liệu giả thực tế</h1>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Tài liệu này giải thích các thành phần — schema, quan hệ khóa ngoại, quy tắc có điều kiện —
                  và cách kết hợp chúng để dữ liệu sinh ra trông giống dữ liệu production thay vì dữ liệu
                  ngẫu nhiên vô nghĩa.
                </p>
              </header>

              {/* Tổng quan */}
              <Section id="overview" title="Tổng quan" icon="lightbulb">
                <p>Synthetic Studio sinh dữ liệu theo ba bước:</p>
                <ol className="list-decimal pl-6 space-y-1 text-sm text-on-surface-variant">
                  <li><strong className="text-on-surface">Định nghĩa schema</strong> — bảng, cột, kiểu dữ liệu, và generator cho từng cột.</li>
                  <li><strong className="text-on-surface">Khai báo quan hệ</strong> — khóa chính, khóa ngoại, và cách phân phối các bản ghi con cho cha.</li>
                  <li><strong className="text-on-surface">Phủ thêm quy tắc</strong> — logic có điều kiện để ghi đè giá trị, đảm bảo dữ liệu nhất quán nội bộ (ví dụ: đơn hàng <em>cancelled</em> phải có <em>shipping_at</em> = NULL).</li>
                </ol>
                <p>
                  Sau đó bạn chọn số dòng cho mỗi bảng, một <em>seed</em> để tái lập, rồi xuất ra
                  CSV / JSON / SQL / SQLite. Chế độ <strong className="text-on-surface">Single Table</strong> là một
                  wizard nhanh cho dataset đơn lẻ; chế độ <strong className="text-on-surface">Projects</strong>
                  dành cho dữ liệu nhiều bảng có FK.
                </p>
              </Section>

              {/* Bắt đầu nhanh */}
              <Section id="quick-start" title="Bắt đầu nhanh" icon="rocket_launch">
                <p>Cách nhanh nhất để có dữ liệu thực tế là bắt đầu từ một schema có sẵn, không phải từ đầu:</p>
                <ul className="list-disc pl-6 space-y-1.5 text-sm text-on-surface-variant">
                  <li><strong className="text-on-surface">Dán SQL DDL</strong> — các câu <code className="bg-surface-container-low px-1.5 py-0.5 rounded">CREATE TABLE</code> kèm ràng buộc FK. Trình phân tích giữ nguyên các quan hệ.</li>
                  <li><strong className="text-on-surface">Dán Prisma schema</strong> — định nghĩa model được tự động chuyển sang dự án nhiều bảng.</li>
                  <li><strong className="text-on-surface">Tải lên CSV</strong> — kiểu dữ liệu của cột được suy ra từ giá trị; phù hợp để khởi tạo wizard nhanh.</li>
                </ul>
                <Callout kind="tip">
                  Sau khi import, mỗi cột sẽ có một generator mặc định theo kiểu của nó. Mở từng bảng và đổi
                  mặc định sang generator phong phú hơn (ví dụ <code>email</code> → Faker email,
                  <code> price</code> → number range).
                </Callout>
              </Section>

              {/* Schema & generator */}
              <Section id="schema" title="Schema & generator" icon="view_column">
                <p>
                  Mỗi cột có một <strong className="text-on-surface">kiểu dữ liệu</strong> và một
                  <strong className="text-on-surface"> cấu hình generator</strong>. Các kiểu có sẵn:
                  <code> string</code>, <code>integer</code>, <code>float</code>, <code>boolean</code>,
                  <code> date</code>, <code>datetime</code>, <code>uuid</code>, <code>email</code>,
                  <code> phone</code>, <code>url</code>, <code>enum</code>, <code>regex</code>.
                </p>
                <p>
                  Generator dựa trên <strong className="text-on-surface">Faker.js</strong> với hơn 30 locale.
                  Hãy chọn locale phù hợp với đối tượng người dùng của bạn (tên tiếng Việt cho sản phẩm VN,
                  địa chỉ Nhật cho sản phẩm JP, ...) — kết quả sẽ thuyết phục hơn nhiều so với việc dùng
                  en-US cho mọi thứ.
                </p>
                <p>Một số tham số generator hữu ích:</p>
                <ul className="list-disc pl-6 space-y-1.5 text-sm text-on-surface-variant">
                  <li><strong className="text-on-surface">min / max / precision</strong> — cho số nguyên và số thực.</li>
                  <li><strong className="text-on-surface">dateFrom / dateTo</strong> — giới hạn date/datetime trong một khoảng.</li>
                  <li><strong className="text-on-surface">enumValues + enumWeights</strong> — trường phân loại với tần suất thực tế (ví dụ: <code>active: 0.85, churned: 0.15</code>).</li>
                  <li><strong className="text-on-surface">pattern</strong> — biểu thức regex cho SKU, license key, ticket number, ...</li>
                  <li><strong className="text-on-surface">nullRate</strong> — từ 0 đến 1, xác suất cột này có giá trị NULL trên một dòng.</li>
                </ul>
              </Section>

              {/* FK */}
              <Section id="fk" title="Quan hệ khóa ngoại (FK)" icon="account_tree">
                <p>
                  Khi một cột được đánh dấu <code>foreign_key</code>, bạn đặt một
                  <strong className="text-on-surface"> tham chiếu pool</strong> dạng <code>users.id</code>.
                  Lúc sinh dữ liệu, các dòng cha được tạo trước (engine sắp xếp tô-pô các bảng), sau đó
                  cột FK lấy mẫu từ pool của bảng cha.
                </p>
                <p>
                  Bấm vào biểu tượng <span className="material-symbols-outlined text-[14px] align-middle">settings</span>
                  cạnh cột foreign_key để mở modal cấu hình FK. Các tùy chọn quan trọng:
                </p>

                <h3 className="font-headline font-bold text-base pt-4">Kiểu phân phối</h3>
                <div className="space-y-3 text-sm">
                  <DistRow label="Uniform (đều)" desc="Mọi giá trị cha có xác suất bằng nhau. Dùng cho các trường không có cụm tự nhiên — gán tag ngẫu nhiên, tham chiếu lookup, ..." />
                  <DistRow label="Weighted (có trọng số)" desc="Một số giá trị cha được chọn nhiều hơn. Yêu cầu phải đặt Fixed Values trước, rồi gán trọng số cho từng giá trị. Dùng cho dữ liệu kiểu lệch (Pareto): 80% đơn hàng đến từ 20% khách hàng." />
                  <DistRow label="Fixed per parent (cố định mỗi cha)" desc="Mỗi bản ghi cha có từ min đến max bản ghi con. Phù hợp với quan hệ một-nhiều: mỗi đơn hàng có 1–5 line item, mỗi user có 0–3 địa chỉ. Modal sẽ ước tính số dòng nên đặt cho bảng con." />
                </div>

                <h3 className="font-headline font-bold text-base pt-4">Null rate (tỉ lệ NULL)</h3>
                <p>
                  Các FK tùy chọn (ví dụ <code>parent_comment_id</code> trên bảng comment) cần null rate
                  khác 0, nếu không bạn sẽ có một cây kết nối hoàn toàn. Kéo thanh trượt đến mức thực tế.
                </p>

                <h3 className="font-headline font-bold text-base pt-4">Fixed values — tập con cố định</h3>
                <p>
                  Giới hạn FK chỉ lấy một số giá trị cha cụ thể thay vì toàn bộ pool. Hữu ích cho theo
                  môi trường ("chỉ seed đơn hàng cho tenant 1, 2, 3") hoặc để ép một kịch bản test
                  đã biết trước.
                </p>

                <Callout kind="tip">
                  <strong>Quy tắc ước lượng kích thước.</strong> Với phân phối <em>fixed_per_parent</em>,
                  đặt số dòng cho bảng con xấp xỉ <em>parent_rows × avg(min, max)</em>. Modal hiển thị
                  ước tính này theo thời gian thực để bạn không phải tự tính.
                </Callout>
              </Section>

              {/* Quy tắc */}
              <Section id="rules" title="Quy tắc có điều kiện" icon="rule_settings">
                <p>
                  Quy tắc là cách bạn biến các dòng ngẫu nhiên thành <em>hợp lý</em>. Chúng chạy sau các
                  generator gốc, nên bất kỳ quy tắc nào cũng có thể ghi đè giá trị đã sinh. Mỗi quy tắc
                  có dạng:
                </p>
                <pre className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-4 text-xs leading-relaxed font-mono overflow-x-auto">
{`IF   <các điều kiện, nối bằng AND>
THEN <hành động> trên <cột đích>`}
                </pre>

                <h3 className="font-headline font-bold text-base pt-4">Toán tử so sánh</h3>
                <p>
                  Mỗi điều kiện so sánh một cột với một giá trị. Nhiều điều kiện trong một quy tắc được
                  nối bằng AND — nếu cần OR, hãy tạo hai quy tắc riêng.
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <OpRow op="==" desc="khớp tuyệt đối" />
                  <OpRow op="!=" desc="khác" />
                  <OpRow op=">" desc="lớn hơn (số / ngày)" />
                  <OpRow op="<" desc="nhỏ hơn (số / ngày)" />
                  <OpRow op=">=" desc="lớn hơn hoặc bằng" />
                  <OpRow op="<=" desc="nhỏ hơn hoặc bằng" />
                  <OpRow op="contains" desc="chuỗi con (phân biệt hoa thường)" />
                  <OpRow op="is null" desc="giá trị là NULL" />
                  <OpRow op="is not null" desc="giá trị có dữ liệu" />
                </div>

                <Callout kind="example">
                  <strong>Ví dụ.</strong> Đánh dấu khách hàng giá trị cao đã rời bỏ:<br />
                  <code className="block mt-2">IF status == "churned" AND lifetime_value &gt; 5000<br />THEN set_enum trên churn_reason → "competitor, price, support, other"</code>
                </Callout>
              </Section>

              {/* Hành động */}
              <Section id="actions" title="Tham chiếu các hành động" icon="play_arrow">
                <p>Bảy loại hành động, chọn từ dropdown THEN:</p>
                <div className="space-y-3">
                  <ActionRow
                    name="set_null"
                    summary="Buộc cột đích về NULL."
                    when="Lan truyền tính nullable — ví dụ đơn hàng đã hủy không nên có shipped_at."
                    example={`IF status == "cancelled" THEN set_null trên shipped_at`}
                  />
                  <ActionRow
                    name="set_not_null"
                    summary="Đảm bảo cột đích không NULL (sinh lại nếu cần)."
                    when="Bất biến của trường bắt buộc mà nullRate của generator có thể vi phạm."
                    example={`IF role == "admin" THEN set_not_null trên email`}
                  />
                  <ActionRow
                    name="set_value"
                    summary="Thay bằng một giá trị hằng."
                    when="Cố định một giá trị khi cờ được bật — thường cho các giá trị sentinel của trạng thái."
                    example={`IF is_test == true THEN set_value trên tier → "internal"`}
                  />
                  <ActionRow
                    name="set_enum"
                    summary="Chọn từ một danh sách (cách nhau bằng dấu phẩy). Mỗi giá trị có xác suất bằng nhau."
                    when="Trường phân loại có nhánh, phụ thuộc vào một cột khác."
                    example={`IF kind == "refund" THEN set_enum trên reason → "duplicate, fraud, customer_request, other"`}
                  />
                  <ActionRow
                    name="set_range"
                    summary="Chọn một số trong khoảng min-max (định dạng: min-max)."
                    when="Khoảng số phụ thuộc theo phân loại — gói cao cấp tính phí cao, gói free là 0."
                    example={`IF plan == "free" THEN set_range trên monthly_fee → 0-0`}
                  />
                  <ActionRow
                    name="derive_offset"
                    summary={'Date tương đối so với cột khác. Định dạng: source_col, min_offset, max_offset, unit.'}
                    when="Mốc thời gian tuần tự — shipped_at luôn sau ordered_at, không bao giờ trước."
                    example={`IF status == "shipped" THEN derive_offset trên shipped_at → ordered_at, 1, 7, days`}
                  />
                  <ActionRow
                    name="derive_compute"
                    summary="Tính cột đích bằng một biểu thức số học từ các cột khác."
                    when="Tổng/tích phải đúng bằng kết quả tính, không nên ngẫu nhiên độc lập."
                    example={`THEN derive_compute trên total → quantity * unit_price`}
                  />
                </div>
                <Callout kind="warn">
                  Thứ tự quy tắc có ý nghĩa. Quy tắc chạy từ trên xuống, một quy tắc sau có thể ghi đè
                  kết quả của quy tắc trước. Nếu hai quy tắc cùng tác động lên một cột, quy tắc khớp
                  cuối cùng sẽ thắng.
                </Callout>
              </Section>

              {/* Persona */}
              <Section id="personas" title="Persona & dữ liệu nhất quán" icon="group">
                <p>
                  Sinh dữ liệu ngẫu nhiên độc lập theo từng cột sẽ vỡ ngay khi chụp ảnh demo: một dòng có
                  tên Nhật, địa chỉ Đức, số điện thoại Ba Lan. <strong className="text-on-surface">Persona</strong>
                  giải quyết điều này bằng cách buộc các trường liên quan dùng chung một "người" được
                  sinh ra.
                </p>
                <p>
                  Khi bạn chọn <code>persona.fullName</code>, các cột <code>persona.email</code>,
                  <code> persona.firstName</code>, <code>persona.city</code>, <code>persona.country</code>,
                  <code> persona.phoneNumber</code>, <code>persona.avatarUrl</code> trong cùng dòng đó
                  đều lấy từ cùng một persona. Locale được tôn trọng nhất quán.
                </p>
                <Callout kind="tip">
                  Dùng persona khi dòng dữ liệu đại diện cho <em>người</em> (user, customer, employee,
                  patient). Với các thực thể không phải người, dùng generator Faker từng cột là đủ.
                </Callout>
              </Section>

              {/* Reproducibility */}
              <Section id="reproducibility" title="Seed & khả năng tái lập" icon="replay">
                <p>
                  Mỗi lần sinh dữ liệu nhận một <strong className="text-on-surface">seed</strong> (tự sinh nếu
                  bạn không đặt). Cùng seed + cùng schema + cùng số dòng = output giống hệt từng byte.
                  Tính chất này khiến Synthetic Studio an toàn cho:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-sm text-on-surface-variant">
                  <li>Bug report — chia sẻ <code>seed=1234, rows=10k</code> và người nhận có chính xác dataset của bạn.</li>
                  <li>Test fixtures — pin seed trong CI để dataset không trôi giữa các lần chạy.</li>
                  <li>Benchmark — so sánh các query engine cần input giống hệt nhau.</li>
                </ul>
                <p>
                  Quá trình sinh chạy theo từng chunk 10k dòng và có thể hủy từ UI; bộ nhớ vẫn được kiểm
                  soát ngay cả với export 10M dòng.
                </p>
              </Section>

              {/* Recipes */}
              <Section id="recipes" title="Công thức theo tình huống" icon="restaurant_menu">
                <Recipe
                  title="E-commerce: orders, line items, customers"
                  steps={[
                    'Customers — uniform, ~10k dòng. Dùng generator persona.* với một locale duy nhất.',
                    'Products — ~500 dòng. SKU bằng regex (PRD-[A-Z]{3}-\\d{4}), price là float range, category là weighted enum (electronics 0.4, clothing 0.3, books 0.2, other 0.1).',
                    'Orders.customer_id — FK weighted với độ lệch kiểu Pareto (top 20 khách hàng có weight 5, còn lại weight 1). Status weighted enum: pending 0.05, paid 0.7, shipped 0.2, cancelled 0.05.',
                    'Order_items.order_id — FK fixed_per_parent, 1–5 item mỗi đơn. quantity range 1–5, unit_price lấy từ products qua FK.',
                    'Quy tắc: IF status == "cancelled" THEN set_null trên shipped_at.',
                    'Quy tắc: IF status == "shipped" THEN derive_offset trên shipped_at → created_at, 1, 7, days.',
                    'Quy tắc: THEN derive_compute trên total → quantity * unit_price.',
                  ]}
                />
                <Recipe
                  title="SaaS: tenants, users, audit log"
                  steps={[
                    'Tenants — 50 dòng. Plan là weighted enum (free 0.6, pro 0.3, enterprise 0.1).',
                    'Users.tenant_id — FK fixed_per_parent, 1–200 user mỗi tenant (lệch theo plan nếu cần dùng quy tắc riêng cho từng tenant). Role là enum (admin, member, viewer).',
                    'Audit_log.user_id — FK weighted. Action là enum (login, logout, update, delete) với tần suất thực tế.',
                    'Quy tắc: IF action == "delete" THEN set_not_null trên resource_id.',
                    'Quy tắc: IF role == "viewer" AND action == "delete" THEN set_value trên action → "login" (viewer không thể xóa).',
                  ]}
                />
                <Recipe
                  title="Dữ liệu mẫu an toàn về tuân thủ (compliance)"
                  steps={[
                    'Import SQL DDL từ production (chỉ structure, không bao giờ dùng giá trị thật).',
                    'Thay mọi cột có tên trùng name/email/phone/ssn/dob bằng generator của Faker.',
                    'Đặt seed = ngày hôm nay. Sinh dữ liệu, export ra SQLite, chia sẻ với team.',
                    'Cùng seed vào ngày mai sẽ sinh ra cùng dataset cho test lặp lại.',
                  ]}
                />
              </Section>

              {/* Gotchas */}
              <Section id="gotchas" title="Mẹo & lỗi thường gặp" icon="warning">
                <ul className="space-y-3 text-sm">
                  <li>
                    <strong className="text-on-surface">FK orphan.</strong> Nếu đặt <code>fkNullRate</code> cao
                    trên một FK NOT NULL, bạn sẽ nhận được dòng vi phạm ràng buộc khi import. Hoặc bỏ
                    NOT NULL trên cột đó, hoặc giảm null rate.
                  </li>
                  <li>
                    <strong className="text-on-surface">Vòng lặp trong FK.</strong> Sắp xếp tô-pô không thể xếp
                    thứ tự các bảng phụ thuộc lẫn nhau. Phá vòng bằng cách cho một phía nullable và sinh
                    nó sau qua quy tắc derive.
                  </li>
                  <li>
                    <strong className="text-on-surface">Cardinality của index.</strong> Phân phối FK uniform tạo
                    tải đều cho mọi cha. Điều này không thực tế cho test hiệu năng — dữ liệu production
                    thường lệch. Dùng weighted hoặc fixed_per_parent để EXPLAIN plan giống production hơn.
                  </li>
                  <li>
                    <strong className="text-on-surface">Xung đột quy tắc.</strong> Hai quy tắc cùng ghi vào một
                    cột sẽ âm thầm để quy tắc sau thắng. Đặt tên cho quy tắc và rà soát danh sách để bắt
                    lỗi này.
                  </li>
                  <li>
                    <strong className="text-on-surface">Persona + locale không khớp.</strong> Nếu chọn persona
                    Việt Nam nhưng số điện thoại định dạng Đức trên cùng dòng, bạn đã đánh mất ý nghĩa của
                    persona. Hãy chọn locale ngay trên persona.
                  </li>
                  <li>
                    <strong className="text-on-surface">Quên seed.</strong> Sinh lại dataset với seed khác sẽ làm
                    hỏng các test pin theo ID dòng cụ thể. Hãy pin seed ngay từ đầu.
                  </li>
                </ul>
              </Section>

              {/* CTA */}
              <div className="pt-4 flex items-center justify-end border-t border-outline-variant/10">
                <Link
                  to="/"
                  className="text-[10px] font-label uppercase tracking-widest text-primary hover:underline"
                >
                  Bắt đầu một dự án →
                </Link>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Section({ id, title, icon, children }: { id: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <h2 className="text-2xl font-bold font-headline tracking-tight flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        {title}
      </h2>
      <div className="text-sm text-on-surface-variant leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Callout({ kind, children }: { kind: 'tip' | 'warn' | 'example'; children: React.ReactNode }) {
  const styles = {
    tip:     { border: 'border-tertiary/30',  bg: 'bg-tertiary/5',     icon: 'lightbulb',   label: 'Mẹo' },
    warn:    { border: 'border-error/30',     bg: 'bg-error/5',        icon: 'warning',     label: 'Lưu ý' },
    example: { border: 'border-primary/30',   bg: 'bg-primary/5',      icon: 'code_blocks', label: 'Ví dụ' },
  }[kind];
  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} p-4 text-sm`}>
      <div className="flex items-center gap-2 mb-2 font-label text-[10px] uppercase tracking-widest text-on-surface">
        <span className="material-symbols-outlined text-[16px]">{styles.icon}</span>
        {styles.label}
      </div>
      <div className="text-on-surface-variant">{children}</div>
    </div>
  );
}

function DistRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="border-l-2 border-primary/40 pl-4">
      <p className="font-headline font-semibold text-on-surface">{label}</p>
      <p className="text-on-surface-variant">{desc}</p>
    </div>
  );
}

function OpRow({ op, desc }: { op: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <code className="bg-surface-container-low px-2 py-0.5 rounded font-mono text-on-surface min-w-[70px] inline-block">{op}</code>
      <span className="text-on-surface-variant">{desc}</span>
    </div>
  );
}

function ActionRow({ name, summary, when, example }: { name: string; summary: string; when: string; example: string }) {
  return (
    <div className="border border-outline-variant/20 rounded-lg p-4 bg-surface-container-low/50 space-y-2">
      <div className="flex items-baseline gap-3">
        <code className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono text-xs font-bold">{name}</code>
        <p className="text-on-surface text-sm">{summary}</p>
      </div>
      <p className="text-xs text-on-surface-variant"><strong className="text-on-surface">Dùng khi:</strong> {when}</p>
      <pre className="text-xs font-mono bg-surface border border-outline-variant/20 rounded px-3 py-2 text-on-surface-variant overflow-x-auto whitespace-pre-wrap">{example}</pre>
    </div>
  );
}

function Recipe({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="border border-outline-variant/20 rounded-lg p-5 bg-surface-container-low/50 space-y-3">
      <h3 className="font-headline font-bold text-base text-on-surface">{title}</h3>
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-on-surface-variant">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  );
}
