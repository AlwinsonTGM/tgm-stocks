/**
 * Market data arrives from the data providers with Chinese names: index names are
 * hardcoded in the fetchers and industry boards use the CSRC classification. These
 * maps give the English UI readable labels without touching the provider payloads.
 */

const INDEX_NAMES_BY_CODE: Record<string, string> = {
  sh000001: 'Shanghai Composite',
  sz399001: 'Shenzhen Component',
  sz399006: 'ChiNext',
  sh000688: 'STAR 50',
  sh000016: 'SSE 50',
  sh000300: 'CSI 300',
  sh000905: 'CSI 500',
  sh000852: 'CSI 1000',
  sz399005: 'SME Board',
  hkHSI: 'Hang Seng',
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq Composite',
  '^DJI': 'Dow Jones',
};

const INDEX_NAMES_BY_NAME: Record<string, string> = {
  上证指数: 'Shanghai Composite',
  深证成指: 'Shenzhen Component',
  创业板指: 'ChiNext',
  科创50: 'STAR 50',
  上证50: 'SSE 50',
  沪深300: 'CSI 300',
  中证500: 'CSI 500',
  中证1000: 'CSI 1000',
  恒生指数: 'Hang Seng',
  纳斯达克: 'Nasdaq Composite',
  标普500: 'S&P 500',
  道琼斯: 'Dow Jones',
};

const INDUSTRY_NAMES: Record<string, string> = {
  '农、林、牧、渔业': 'Agriculture, forestry, animal husbandry, fishery',
  农业: 'Agriculture',
  林业: 'Forestry',
  畜牧业: 'Animal husbandry',
  渔业: 'Fishery',
  '农、林、牧、渔服务业': 'Agricultural services',
  采矿业: 'Mining',
  煤炭开采和洗选业: 'Coal mining and washing',
  石油和天然气开采业: 'Oil and gas extraction',
  黑色金属矿采选业: 'Ferrous metal mining',
  有色金属矿采选业: 'Non-ferrous metal mining',
  非金属矿采选业: 'Non-metallic mineral mining',
  开采辅助活动: 'Mining support activities',
  制造业: 'Manufacturing',
  农副食品加工业: 'Agricultural and sideline food processing',
  食品制造业: 'Food manufacturing',
  '酒、饮料和精制茶制造业': 'Wine, beverage and refined tea',
  烟草制品业: 'Tobacco products',
  纺织业: 'Textiles',
  '纺织服装、服饰业': 'Textile garments and apparel',
  '皮革、毛皮、羽毛及其制品和制鞋业': 'Leather, fur, feathers and footwear',
  '木材加工和木、竹、藤、棕、草制品业': 'Wood processing and wood products',
  家具制造业: 'Furniture manufacturing',
  造纸和纸制品业: 'Paper and paper products',
  印刷和记录媒介复制业: 'Printing and media reproduction',
  '文教、工美、体育和娱乐用品制造业': 'Cultural, educational, sports and entertainment goods',
  '石油加工、炼焦和核燃料加工业': 'Petroleum refining, coking and nuclear fuel',
  化学原料和化学制品制造业: 'Chemical raw materials and products',
  医药制造业: 'Pharmaceuticals',
  化学纤维制造业: 'Chemical fibers',
  橡胶和塑料制品业: 'Rubber and plastics',
  非金属矿物制品业: 'Non-metallic mineral products',
  黑色金属冶炼和压延加工业: 'Ferrous metal smelting and rolling',
  有色金属冶炼和压延加工业: 'Non-ferrous metal smelting and rolling',
  金属制品业: 'Metal products',
  通用设备制造业: 'General equipment',
  专用设备制造业: 'Special-purpose equipment',
  汽车制造业: 'Automotive',
  '铁路、船舶、航空航天和其他运输设备制造业': 'Railway, ship, aerospace and other transport equipment',
  电气机械和器材制造业: 'Electrical machinery and apparatus',
  '计算机、通信和其他电子设备制造业': 'Computers, communications and electronics',
  仪器仪表制造业: 'Instruments and meters',
  其他制造业: 'Other manufacturing',
  废弃资源综合利用业: 'Waste resource utilization',
  '金属制品、机械和设备修理业': 'Metal products, machinery and equipment repair',
  '电力、热力生产和供应业': 'Electricity and heat production and supply',
  燃气生产和供应业: 'Gas production and supply',
  水的生产和供应业: 'Water production and supply',
  建筑业: 'Construction',
  房屋建筑业: 'Building construction',
  土木工程建筑业: 'Civil engineering',
  建筑安装业: 'Building installation',
  建筑装饰和其他建筑业: 'Building decoration and other construction',
  批发和零售业: 'Wholesale and retail',
  批发业: 'Wholesale',
  零售业: 'Retail',
  '交通运输、仓储和邮政业': 'Transport, warehousing and postal',
  铁路运输业: 'Railway transport',
  道路运输业: 'Road transport',
  水上运输业: 'Water transport',
  航空运输业: 'Air transport',
  管道运输业: 'Pipeline transport',
  装卸搬运和运输代理业: 'Handling and transport agency',
  仓储业: 'Warehousing',
  邮政业: 'Postal',
  住宿和餐饮业: 'Accommodation and catering',
  住宿业: 'Accommodation',
  餐饮业: 'Catering',
  '信息传输、软件和信息技术服务业': 'Information transmission, software and IT services',
  '电信、广播电视和卫星传输服务': 'Telecom, broadcasting and satellite transmission',
  互联网和相关服务: 'Internet and related services',
  软件和信息技术服务业: 'Software and IT services',
  金融业: 'Financials',
  货币金融服务: 'Monetary and financial services',
  资本市场服务: 'Capital markets services',
  保险业: 'Insurance',
  其他金融业: 'Other financials',
  房地产业: 'Real estate',
  租赁和商务服务业: 'Leasing and business services',
  租赁业: 'Leasing',
  商务服务业: 'Business services',
  科学研究和技术服务业: 'Scientific research and technical services',
  研究和试验发展: 'Research and experimental development',
  专业技术服务业: 'Professional technical services',
  科技推广和应用服务业: 'Technology promotion and application services',
  '水利、环境和公共设施管理业': 'Water conservancy, environment and public facilities',
  水利管理业: 'Water conservancy',
  生态保护和环境治理业: 'Ecological protection and environmental governance',
  公共设施管理业: 'Public facilities management',
  '居民服务、修理和其他服务业': 'Resident services, repair and other services',
  教育: 'Education',
  卫生和社会工作: 'Health and social work',
  卫生: 'Health',
  社会工作: 'Social work',
  '文化、体育和娱乐业': 'Culture, sports and entertainment',
  新闻和出版业: 'News and publishing',
  '广播、电视、电影和影视录音制作业': 'Broadcasting, TV, film and recording',
  文化艺术业: 'Culture and arts',
  体育: 'Sports',
  娱乐业: 'Entertainment',
  综合: 'Conglomerates',
};

/** Index names are matched by code first, then by the Chinese name. */
export function localizeIndexName(
  code: string | undefined,
  name: string,
  language: string,
): string {
  if (language !== 'en') {
    return name;
  }

  const byCode = code ? INDEX_NAMES_BY_CODE[code.trim()] : undefined;
  if (byCode) {
    return byCode;
  }

  return INDEX_NAMES_BY_NAME[name.trim()] ?? name;
}

/** Industry boards use the CSRC classification; unknown names pass through unchanged. */
export function localizeSectorName(name: string, language: string): string {
  if (language !== 'en') {
    return name;
  }

  return INDUSTRY_NAMES[name.trim()] ?? name;
}
